'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture, verificationCode } = require('./helpers');
const crypto = require('node:crypto');
const { openDatabase } = require('../backend/database');
const { createAuth } = require('../backend/auth');
const { createLimiter, passwordHasher } = require('../backend/security');
function mailToken(message) { return new URL(message.text.match(/https?:\/\/\S+/)[0]).hash.slice(7); }

test('a password reset committed during login hashing prevents an old-password session', async () => {
  const db = openDatabase(':memory:'); const now = Date.now;
  try {
    const salt = crypto.randomBytes(16).toString('hex'); const secret = 'Original-learner-password';
    const hash = (await passwordHasher()(secret, salt)).toString('hex');
    db.prepare('INSERT INTO users(id,name,email,password_hash,password_salt,created_at) VALUES(?,?,?,?,?,?)')
      .run('learner', 'Learner', 'learner@example.test', hash, salt, new Date().toISOString());
    const auth = createAuth({ db, now, limiter: createLimiter(db, now), mailer: {}, production: false });
    const headers = [];
    const login = auth.login({ headers: {} }, { setHeader: (...args) => headers.push(args) }, { email: 'learner@example.test', password: secret });
    const denied = assert.rejects(login, { status: 401 });
    // Commit another password while scrypt is in flight, as reset/change does.
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run('0'.repeat(64), 'learner');
    db.prepare('DELETE FROM sessions WHERE user_id=?').run('learner');
    await denied;
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sessions').get().count, 0);
    assert.equal(headers.length, 0);
  } finally { db.close(); }
});

test('verification and recovery tokens are single-use; reset revokes every old session', async t => {
  const f = await fixture(t,{publicOrigin:'https://learn.example',production:true});
  const a = await f.register('recover@example.test',{verify:false}); assert.equal(a.body.user.emailVerified,false);
  assert.match(a.headers.get('set-cookie'),/Secure/);
  await f.app.flushMail(); const verification = f.messages[0];
  assert(!verification.text.includes('#token=')); const verify = verificationCode(verification);
  assert(!JSON.stringify(a.body).includes(verify));
  assert.equal((await f.request('/api/auth/verify-email',{code:verify},a.cookie)).status,200);
  assert.equal((await f.request('/api/auth/verify-email',{code:verify},a.cookie)).status,400);
  assert.equal((await f.request('/api/session',undefined,a.cookie)).body.user.emailVerified,true);
  const second = await f.request('/api/auth/login',{email:a.body.user.email,password:'Test-learner-password'});
  const known = await f.request('/api/auth/forgot-password',{email:a.body.user.email});
  const unknown = await f.request('/api/auth/forgot-password',{email:'missing@example.test'});
  assert.equal(known.status,unknown.status); assert.equal(known.body.message,unknown.body.message);
  await f.app.flushMail(); const reset = mailToken(f.messages.find(m=>m.text.includes('mode=reset')));
  assert.equal((await f.request('/api/auth/reset-password',{token:reset,password:'New-recovery-password'})).status,200);
  assert.equal((await f.request('/api/auth/reset-password',{token:reset,password:'Another-new-password'})).status,400);
  assert.equal((await f.request('/api/progress',undefined,a.cookie)).status,401);
  assert.equal((await f.request('/api/progress',undefined,second.cookie)).status,401);
  assert.equal((await f.request('/api/auth/login',{email:a.body.user.email,password:'Test-learner-password'})).status,401);
  assert.equal((await f.request('/api/auth/login',{email:a.body.user.email,password:'New-recovery-password'})).status,200);
  const log = JSON.stringify(f.logs); assert(!log.includes(reset)); assert(!log.includes(verify)); assert(!log.includes(a.body.user.email));
});

test('expired links fail and password change/session revocation require account ownership', async t => {
  let clock=Date.now(); const f=await fixture(t,{now:()=>clock}); const a=await f.register(); const b=await f.register();
  const other=await f.request('/api/auth/login',{email:a.body.user.email,password:'Test-learner-password'});
  const sessions=(await f.request('/api/auth/sessions',undefined,a.cookie)).body.sessions;
  assert.equal(sessions.length,2); assert.equal(sessions.filter(s=>s.current).length,1); assert(!JSON.stringify(sessions).includes('token_hash'));
  const revoke=sessions.find(s=>!s.current).id;
  assert.equal((await f.request('/api/auth/revoke-session',{id:revoke},b.cookie)).status,404);
  assert.equal((await f.request('/api/auth/revoke-session',{id:revoke},a.cookie)).status,200);
  assert.equal((await f.request('/api/progress',undefined,other.cookie)).status,401);
  assert.equal((await f.request('/api/auth/change-password',{currentPassword:'wrong',password:'Changed-password-value'},a.cookie)).status,401);
  const changed=await f.request('/api/auth/change-password',{currentPassword:'Test-learner-password',password:'Changed-password-value'},a.cookie);
  assert.equal(changed.status,200); assert(changed.cookie);
  assert.equal((await f.request('/api/progress',undefined,a.cookie)).status,401);
  assert.equal((await f.request('/api/progress',undefined,changed.cookie)).status,200);
  assert.equal((await f.request('/api/auth/revoke-others',{},changed.cookie)).status,200);
  await f.request('/api/auth/forgot-password',{email:a.body.user.email}); await f.app.flushMail();
  const reset=mailToken(f.messages.find(m=>m.to===a.body.user.email&&m.text.includes('mode=reset')));
  clock+=3600001;
  assert.equal((await f.request('/api/auth/reset-password',{token:reset,password:'Another-new-password'})).status,400);
});

test('mail queue retries failed delivery without exposing token contents in logs', async t => {
  let clock=Date.now(), attempts=0; const delivered=[];
  const f=await fixture(t,{now:()=>clock,deliverMail:message=>{attempts++; if(attempts===1)throw new Error('Failure'); delivered.push(message);}});
  await f.register(undefined,{verify:false}); await f.app.flushMail(); assert.equal(attempts,1); assert.equal(delivered.length,0);
  clock+=120001; await f.app.flushMail(); assert.equal(delivered.length,1); assert.equal(attempts,2);
  assert(f.logs.some(event=>event.event==='mail_delivery_failed'));
  assert(!JSON.stringify(f.logs).includes(verificationCode(delivered[0])));
});
