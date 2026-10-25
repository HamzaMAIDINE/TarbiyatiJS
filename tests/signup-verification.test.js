'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const { fixture, verificationCode } = require('./helpers');
const { tokenHash } = require('../backend/security');
function token(message) { return new URL(message.text.match(/https?:\/\/\S+/)[0]).hash.slice(7); }

test('signup and login keep unverified accounts out of learning pages and APIs',async t => {
  const f = await fixture(t); const a = await f.register('signup@example.test',{verify:false});
  assert.equal(a.status,201); assert.equal(a.body.user.emailVerified,false); assert.equal(a.body.verification.required,true);
  assert.equal(a.body.progress,undefined); assert.equal(a.body.totals,undefined); assert(a.cookie);
  const session = await f.request('/api/session',undefined,a.cookie);
  assert.equal(session.body.user.emailVerified,false); assert.equal(session.body.progress,undefined);
  for (const route of ['/api/progress','/api/reviews','/api/quizzes/active','/api/quizzes/history','/api/drafts']) {
    const response = await f.request(route,undefined,a.cookie); assert.equal(response.status,403,route); assert.equal(response.body.code,'EMAIL_VERIFICATION_REQUIRED');
  }
  for (const [route,body] of [['/api/progress',{type:'module',id:'mod-1',completed:true,operationId:randomUUID()}],['/api/quizzes/start',{mode:'exam',operationId:randomUUID()}],['/api/drafts/save',{}]]) {
    assert.equal((await f.request(route,body,a.cookie)).status,403,route);
  }
  for (const route of ['/pages/dashboard.html','/pages/modules.html','/pages/quiz.html','/pages/settings.html']) {
    const response = await f.request(route,undefined,a.cookie); assert.equal(response.status,302); assert.match(response.headers.get('location'),/mode=pending&next=/);
  }
  const login = await f.request('/api/auth/login',{email:a.body.user.email,password:'Test-learner-password'});
  assert.equal(login.status,200); assert.equal(login.body.user.emailVerified,false); assert.equal(login.body.progress,undefined);
  await f.app.flushMail(); const proof = verificationCode(f.messages.findLast(message=>message.to===a.body.user.email));
  assert(!JSON.stringify(a.body).includes(proof));
  assert.equal((await f.request('/api/auth/verify-email',{code:proof})).status,401,'a code requires an account session');
  assert.equal((await f.request('/api/auth/verify-email',{code:proof},login.cookie)).status,200,'proof works after signing in on another device');
  assert.equal((await f.request('/api/auth/verify-email',{code:proof},a.cookie)).status,400,'the proof is single-use');
  for (const cookie of [a.cookie,login.cookie]) {
    assert.equal((await f.request('/api/session',undefined,cookie)).body.user.emailVerified,true);
    assert.equal((await f.request('/api/progress',undefined,cookie)).status,200);
    assert.equal((await f.request('/pages/dashboard.html',undefined,cookie)).status,200);
  }
});

test('resending uses a persistent cooldown and quota, and replaces old confirmation codes',async t => {
  let clock = Date.now(); const f = await fixture(t,{now:()=>clock}); const a = await f.register('resend@example.test',{verify:false});
  await f.app.flushMail(); const original = verificationCode(f.messages[0]);
  const fast = await f.request('/api/auth/request-verification',{},a.cookie);
  assert.equal(fast.status,429); assert.equal(Number(fast.headers.get('retry-after')),60);
  await f.stop(); await f.start();
  assert.equal((await f.request('/api/auth/request-verification',{},a.cookie)).status,429,'restart cannot bypass the cooldown');
  clock += 60001;
  assert.equal((await f.request('/api/auth/request-verification',{},a.cookie)).status,200); await f.app.flushMail();
  assert.notEqual(verificationCode(f.messages.at(-1)),original);
  assert.equal((await f.request('/api/auth/verify-email',{code:original},a.cookie)).status,400,'replaced codes fail');
  clock += 60001;
  const third = await f.request('/api/auth/request-verification',{},a.cookie); assert.equal(third.status,200); assert(third.body.verification.retryAfter > 60);
  await f.app.flushMail(); assert.equal(f.messages.length,3);
  clock += 60001;
  assert.equal((await f.request('/api/auth/request-verification',{},a.cookie)).status,429);
  const latest = verificationCode(f.messages.at(-1)); assert.equal((await f.request('/api/auth/verify-email',{code:latest},a.cookie)).status,200);
  assert.equal((await f.request('/api/progress',undefined,a.cookie)).status,200);
});

test('expired codes and recovery links cannot activate an account',async t => {
  let clock = Date.now(); const f = await fixture(t,{now:()=>clock}); const a = await f.register('expired-signup@example.test',{verify:false});
  await f.app.flushMail(); const original = verificationCode(f.messages[0]);
  await f.request('/api/auth/forgot-password',{email:a.body.user.email}); await f.app.flushMail();
  const recovery = token(f.messages.findLast(message=>message.text.includes('mode=reset')));
  assert.equal((await f.request('/api/auth/verify-email',{token:recovery})).status,400);
  clock += 600000;
  assert.equal((await f.request('/api/auth/verify-email',{code:original},a.cookie)).status,400);
  assert.equal((await f.request('/api/progress',undefined,a.cookie)).status,403);
  assert.equal((await f.request('/api/auth/request-verification',{},a.cookie)).status,200);
});

test('codes are scoped to an account and failed attempts survive restart and resend',async t => {
  let clock = Date.now(); const f = await fixture(t,{now:()=>clock});
  const a = await f.register('code-owner@example.test',{verify:false});
  const b = await f.register('other-owner@example.test',{verify:false});
  await f.app.flushMail(); const code = verificationCode(f.messages.find(message=>message.to===a.body.user.email));
  const db = new DatabaseSync(path.join(f.directory,'test.sqlite'));
  try {
    assert.equal(db.prepare("SELECT token_hash FROM account_tokens WHERE user_id=? AND purpose='verify'").get(a.body.user.id).token_hash,
      tokenHash(`verify:${a.body.user.id}:${code}`));
    // Ensure the other account's independently generated code cannot coincide with this one.
    db.prepare("UPDATE account_tokens SET token_hash=? WHERE user_id=? AND purpose='verify'")
      .run(tokenHash(`verify:${b.body.user.id}:${code === '000000' ? '000001' : '000000'}`),b.body.user.id);
  } finally { db.close(); }
  assert.equal((await f.request('/api/auth/verify-email',{code},b.cookie)).status,400);
  assert.equal((await f.request('/api/auth/verify-email',{code},b.cookie,{'X-ScienceEdu-User':a.body.user.id})).status,409);
  for (const invalid of ['12345','abcdef',145974,'1234567','１２３４５６'])
    assert.equal((await f.request('/api/auth/verify-email',{code:invalid},a.cookie)).status,400);
  await f.stop(); await f.start();
  const blocked = await f.request('/api/auth/verify-email',{code},a.cookie);
  assert.equal(blocked.status,429); assert(Number(blocked.headers.get('retry-after'))>0);
  clock += 60001;
  assert.equal((await f.request('/api/auth/request-verification',{},a.cookie)).status,200);
  await f.app.flushMail(); const resent = verificationCode(f.messages.findLast(message=>message.to===a.body.user.email));
  assert.equal((await f.request('/api/auth/verify-email',{code:resent},a.cookie)).status,429,'resend does not reset the guessing limit');
  clock += 15 * 60000;
  assert.equal((await f.request('/api/auth/request-verification',{},a.cookie)).status,200);
  await f.app.flushMail(); const fresh = verificationCode(f.messages.findLast(message=>message.to===a.body.user.email));
  assert.equal((await f.request('/api/auth/verify-email',{code:fresh},a.cookie)).status,200);
});

test('legacy confirmation links still work for emails already sent before the code update',async t => {
  const f = await fixture(t); const a = await f.register('legacy-link@example.test',{verify:false});
  const proof = randomBytes(32).toString('hex');
  const db = new DatabaseSync(path.join(f.directory,'test.sqlite'));
  try {
    db.prepare("UPDATE account_tokens SET token_hash=? WHERE user_id=? AND purpose='verify'").run(tokenHash(proof),a.body.user.id);
  } finally { db.close(); }
  assert.equal((await f.request('/api/auth/verify-email',{token:proof})).status,200);
  assert.equal((await f.request('/api/session',undefined,a.cookie)).body.user.emailVerified,true);
});

test('signup does not create an unusable account when production mail is unconfigured',async t => {
  const f = await fixture(t,{production:true,publicOrigin:'https://learn.example',deliverMail:null,emailWebhookUrl:''});
  const response = await f.register('no-delivery@example.test',{verify:false});
  assert.equal(response.status,503); assert.equal(response.cookie,undefined);
  const db = new DatabaseSync(path.join(f.directory,'test.sqlite'),{readOnly:true});
  try { assert.equal(db.prepare('SELECT COUNT(*) AS count FROM users').get().count,0); assert.equal(db.prepare('SELECT COUNT(*) AS count FROM account_tokens').get().count,0); }
  finally { db.close(); }
});
