'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const nodemailer = require('nodemailer');
const { brevoConfig, brevoTransport } = require('../backend/brevo');
const { fixture, verificationCode } = require('./helpers');

const env = { BREVO_API_KEY: 'private-brevo-api-key', SMTP_FROM: 'sender@example.test', SMTP_FROM_NAME: 'Tarbiyati · تربيتي' };
const config = brevoConfig(env);
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('Brevo HTTPS requires a separate API key and verified sender configuration', () => {
  assert.equal(brevoConfig({}), null);
  assert.equal(brevoConfig({ SMTP_KEY: 'smtp-key' }), null);
  assert.throws(() => brevoConfig({ ...env, BREVO_API_KEY: 'xsmtpsib-example' }), /separate from SMTP_KEY/);
  for (const value of [' leading-space', 'trailing-space ', 'key\r\nInjected: value']) assert.throws(() => brevoConfig({ ...env, BREVO_API_KEY: value }), /spaces or line breaks/);
  for (const value of ['', 'not-an-address', 'sender@example.test\nBcc: other@example.test']) assert.throws(() => brevoConfig({ ...env, SMTP_FROM: value }), /verified sender/);
  assert.equal(config.name, 'Tarbiyati · تربيتي');
});

test('HTTPS diagnostics only read account status and never send a message', async () => {
  const calls = [];
  const transport = brevoTransport(config, async (url, options) => { calls.push({ url, options }); return json({ plan: [] }); });
  assert.equal(await transport.verify(), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.brevo.com/v3/account');
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.body, undefined);
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.headers['api-key'], env.BREVO_API_KEY);
});

test('verification codes use HTTPS ahead of SMTP and accepted message bodies are cleared', async t => {
  const requests = [];
  t.mock.method(nodemailer, 'createTransport', () => { throw new Error('SMTP must not be selected for HTTPS delivery.'); });
  const f = await fixture(t, { deliverMail: null, brevo: config, fetchMail: async (url, options) => {
    requests.push({ url, options, body: JSON.parse(options.body) }); return json({ messageId: '<accepted@example.test>' }, 201);
  } });
  const account = await f.register('api-learner@example.test', { verify: false });
  assert.equal(account.body.verification.deliveryStatus, 'pending');
  await f.app.flushMail();
  assert.equal(requests.length, 1);
  const { url, body } = requests[0];
  assert.equal(url, 'https://api.brevo.com/v3/smtp/email');
  assert.deepEqual(body.sender, { email: env.SMTP_FROM, name: env.SMTP_FROM_NAME });
  assert.deepEqual(body.to, [{ email: 'api-learner@example.test' }]);
  assert(body.subject.includes('تربيتي'));
  assert.match(body.headers.IdempotencyKey, /^[a-f0-9-]{36}$/);
  assert.equal((await f.request('/api/session', undefined, account.cookie)).body.verification.deliveryStatus, 'sent');
  const db = new DatabaseSync(path.join(f.directory, 'test.sqlite'), { readOnly: true });
  try { assert.equal(db.prepare('SELECT body FROM mail_jobs').get().body, ''); }
  finally { db.close(); }
  assert.equal((await f.request('/api/auth/verify-email', { code: verificationCode({ text: body.textContent }) }, account.cookie)).status, 200);
  assert(!JSON.stringify(f.logs).includes(env.BREVO_API_KEY));
});

test('API failures remain retryable, report safe errors, and reuse the idempotency key', async t => {
  let clock = Date.now(), failing = true;
  const requests = [];
  const f = await fixture(t, { now: () => clock, deliverMail: null, brevo: config, fetchMail: async (url, options) => {
    requests.push(JSON.parse(options.body));
    return failing ? json({ code: 'unauthorized', message: env.BREVO_API_KEY + ' secret@example.test' }, 401) : json({ messageId: '<accepted@example.test>' }, 201);
  } });
  const account = await f.register('api-retry@example.test', { verify: false });
  await f.app.flushMail();
  assert.equal((await f.request('/api/session', undefined, account.cookie)).body.verification.deliveryStatus, 'retrying');
  const failure = f.logs.find(event => event.event === 'mail_delivery_failed');
  assert.equal(failure.errorCode, 'EBREVO_AUTH'); assert.equal(failure.responseCode, 401); assert.equal(failure.transport, 'brevo_https');
  assert(!JSON.stringify(f.logs).includes(env.BREVO_API_KEY)); assert(!JSON.stringify(f.logs).includes('secret@example.test'));
  failing = false; clock += 120001; await f.app.flushMail();
  assert.equal(requests.length, 2);
  assert.equal(requests[0].headers.IdempotencyKey, requests[1].headers.IdempotencyKey);
  assert.equal((await f.request('/api/session', undefined, account.cookie)).body.verification.deliveryStatus, 'sent');
  clock += 600000;
  assert.equal((await f.request('/api/session', undefined, account.cookie)).body.verification.deliveryStatus, 'expired');
});

test('API transport rejects malformed responses and only treats idempotency duplicates as accepted', async () => {
  const message = { id: randomUUID(), to: 'learner@example.test', subject: 'Verification', text: '123456' };
  const duplicate = brevoTransport(config, async () => json({ code: 'duplicate_parameter', message: 'Idempotency key already used' }, 400));
  await duplicate.send(message);
  for (const [response, code] of [
    [json({ code: 'duplicate_parameter', message: 'Recipient parameter duplicated' }, 400), 'EBREVO_REJECTED'],
    [json({ message: 'Invalid sender' }, 400), 'EBREVO_SENDER'],
    [json({}, 429), 'EBREVO_RATE_LIMIT'],
    [json({}, 402), 'EBREVO_QUOTA'],
    [new Response('not JSON', { status: 201 }), 'EBREVO_RESPONSE']
  ]) {
    await assert.rejects(brevoTransport(config, async () => response).send(message), { code });
  }
  await assert.rejects(brevoTransport(config, async () => { throw new DOMException('Timed out', 'TimeoutError'); }).send(message), { code: 'ETIMEDOUT' });
});
