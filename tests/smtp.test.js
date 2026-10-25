'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const { smtpConfig, smtpTransport } = require('../backend/smtp');
const { fixture, verificationCode } = require('./helpers');

const settings = { SMTP_HOST: 'smtp-relay.brevo.com', SMTP_PORT: '587', SMTP_SECURE: 'false',
  SMTP_USER: 'test-login', SMTP_KEY: 'private-smtp-key', SMTP_FROM: 'sender@example.test' };

test('SMTP configuration requires credentials and enforces encrypted connections', t => {
  assert.equal(smtpConfig({}),null);
  assert.equal(smtpConfig({SMTP_HOST:'smtp-relay.brevo.com',SMTP_PORT:'587'}),null);
  for (const key of ['SMTP_HOST','SMTP_USER','SMTP_KEY','SMTP_FROM'])
    assert.throws(()=>smtpConfig({...settings,[key]:''}),/requires SMTP_/);
  assert.throws(()=>smtpConfig({...settings,SMTP_PORT:'invalid'}),/SMTP_PORT/);
  assert.throws(()=>smtpConfig({...settings,SMTP_SECURE:'invalid'}),/SMTP_SECURE/);
  assert.throws(()=>smtpConfig({...settings,SMTP_FROM:'invalid\r\nBcc: someone@example.test'}),/SMTP_FROM/);
  assert.equal(smtpConfig({...settings,SMTP_PASS:'old-password'}).pass,settings.SMTP_KEY,'the SMTP key takes precedence');
  assert.equal(smtpConfig({...settings,SMTP_KEY:'',SMTP_PASS:'legacy-key'}).pass,'legacy-key','existing password settings still work');
  assert.throws(()=>smtpConfig({SMTP_KEY:'private-smtp-key'}),/requires SMTP_/,'a key still requires a login and sender');
  const configs = [];
  t.mock.method(nodemailer,'createTransport',options=>{configs.push(options);return {};});
  smtpTransport(smtpConfig(settings));
  smtpTransport(smtpConfig({...settings,SMTP_PORT:'465',SMTP_SECURE:''}));
  assert.equal(configs[0].secure,false); assert.equal(configs[0].requireTLS,true);
  assert.equal(configs[1].secure,true);
  assert.deepEqual(configs[0].auth,{user:settings.SMTP_USER,pass:settings.SMTP_KEY});
});

test('SMTP sends verification codes in development and clears sent message bodies',async t => {
  const outgoing = []; let closed = false;
  t.mock.method(nodemailer,'createTransport',()=>({sendMail:async message=>outgoing.push(message),close:()=>{closed=true;}}));
  const f = await fixture(t,{deliverMail:null,smtp:smtpConfig(settings)});
  const account = await f.register('real-recipient@example.test',{verify:false});
  assert.equal(account.body.verification.delivery,'email');
  await f.app.flushMail(); assert.equal(outgoing.length,1);
  assert.equal(outgoing[0].to,'real-recipient@example.test');
  assert.equal(outgoing[0].from.address,'sender@example.test');
  const code = verificationCode(outgoing[0]);
  assert.equal((await f.request('/api/auth/verify-email',{code},account.cookie)).status,200);
  const db = new DatabaseSync(path.join(f.directory,'test.sqlite'),{readOnly:true});
  try {
    assert.equal(db.prepare('SELECT status FROM mail_jobs').get().status,'sent');
    assert.equal(db.prepare('SELECT body FROM mail_jobs').get().body,'');
  } finally { db.close(); }
  assert(!JSON.stringify(f.logs).includes(settings.SMTP_KEY));
  await f.stop(); assert.equal(closed,true);
});

test('queued emails discard replaced or expired codes instead of retrying stale messages',async t => {
  let clock = Date.now(), attempts = 0; const messages = [];
  const f = await fixture(t,{now:()=>clock,deliverMail:message=>{attempts++;if(attempts===1)throw new Error('SMTP unavailable');messages.push(message);}});
  const account = await f.register('retry-code@example.test',{verify:false});
  await f.app.flushMail(); assert.equal(attempts,1);
  clock += 60001;
  assert.equal((await f.request('/api/auth/request-verification',{},account.cookie)).status,200);
  await f.app.flushMail(); assert.equal(messages.length,1);
  clock += 120001; await f.app.flushMail(); assert.equal(attempts,2,'the replaced job is never retried');
  assert.equal((await f.request('/api/auth/verify-email',{code:verificationCode(messages[0])},account.cookie)).status,200);

  await f.register('expired-queue@example.test',{verify:false});
  clock += 600000; await f.app.flushMail();
  assert.equal(messages.length,1,'an expired code is never delivered');
  const db = new DatabaseSync(path.join(f.directory,'test.sqlite'),{readOnly:true});
  try { assert.equal(db.prepare("SELECT COUNT(*) AS count FROM mail_jobs WHERE status='failed' AND body=''").get().count,2); }
  finally { db.close(); }
});
