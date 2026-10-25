'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const { fixture } = require('./helpers');
const { createApp } = require('../server');
const { requestOrigin } = require('../backend/security');
const { openDatabase } = require('../backend/database');
const { createMailer } = require('../backend/mail');

test('forwarded origins require an explicit trusted proxy and cannot poison recovery links', async t => {
  const f = await fixture(t), account = await f.register();
  const attack = { 'X-Forwarded-Host': 'attacker.example', 'X-Forwarded-Proto': 'https' };
  const denied = await f.request('/api/progress', { type: 'module', id: 'mod-1', completed: true, operationId: randomUUID() }, account.cookie,
    { ...attack, Origin: 'https://attacker.example' });
  assert.equal(denied.status, 403);
  assert.equal((await f.request('/api/auth/forgot-password', { email: account.body.user.email }, null, { ...attack, Origin: '' })).status, 200);
  await f.app.flushMail();
  const recovery = f.messages.findLast(message => message.text.includes('#token='));
  assert(recovery.text.includes(f.origin + '/pages/account.html?mode=reset#token='));
  assert(!recovery.text.includes('attacker.example'));
  const req = { socket: { remoteAddress: '::ffff:127.0.0.1' }, headers: { host: 'localhost:3000', origin: 'https://learn.example',
    'x-forwarded-host': 'attacker.example, learn.example', 'x-forwarded-proto': 'http, https' } };
  assert.deepEqual(requestOrigin(req, new Set(['127.0.0.1'])), { origin: 'https://learn.example', allowed: true });
  assert.equal(requestOrigin(req, new Set()).allowed, false);
  assert.equal(requestOrigin(req, new Set(), 'https://learn.example').allowed, true);
  assert.throws(() => requestOrigin({ socket: {}, headers: { host: 'user@example.com/path' } }, new Set()), { status: 400 });
});

test('production configuration fails early for invalid origins and backup schedules', () => {
  const options = { databasePath: ':memory:', smtp: null, logger: () => {} };
  for (const publicOrigin of ['https://user:pass@learn.example', 'https://learn.example/subpath', 'https://learn.example/?query=1', 'https://learn.example/#fragment', 'file:///tmp']) {
    assert.throws(() => createApp({ ...options, publicOrigin }), /PUBLIC_ORIGIN/);
  }
  assert.throws(() => createApp({ ...options, production: true, publicOrigin: '' }), /Production requires/);
  for (const backupIntervalHours of [-1, NaN, Infinity, 1000]) assert.throws(() => createApp({ ...options, backupIntervalHours }), /BACKUP_INTERVAL_HOURS/);
});

test('admin input errors return 400 and do not change accounts', async t => {
  const f = await fixture(t, { adminEmails: ['admin@example.test'] });
  const account = await f.register('admin@example.test');
  for (const id of [undefined, null, false, 42, [], {}, 'invalid']) {
    for (const action of ['verify', 'unverify', 'reset-password', 'delete']) assert.equal((await f.request('/api/admin/users/' + action, { id }, account.cookie)).status, 400, action);
  }
  for (const value of ['Infinity', 'NaN', '0', '-1', '1.5', '999999999999999999999']) {
    for (const field of ['page', 'limit']) assert.equal((await f.request(`/api/admin/users?${field}=${value}`, undefined, account.cookie)).status, 400, field + '=' + value);
    assert.equal((await f.request('/api/admin/mail-jobs?limit=' + value, undefined, account.cookie)).status, 400);
  }
  assert.equal((await f.request('/api/admin/users?search=' + 'x'.repeat(201), undefined, account.cookie)).status, 400);
  assert.equal((await f.request('/api/admin/users/detail?id=invalid', undefined, account.cookie)).status, 400);
  assert.equal((await f.request('/api/admin/overview', undefined, account.cookie)).body.stats.verifiedUsers, 1);
  assert(!f.logs.some(event => event.event === 'request_failed'));
});

test('mail retries exclude empty, expired and replaced messages', async t => {
  const f = await fixture(t, { adminEmails: ['admin@example.test'] });
  const account = await f.register('admin@example.test');
  const db = new DatabaseSync(path.join(f.directory, 'test.sqlite'));
  try {
    for (const [hash, expiry] of [['valid-proof', Date.now() + 600000], ['expired-proof', 0]]) db.prepare('INSERT INTO account_tokens VALUES(?,?,?,?)').run(hash, account.body.user.id, 'reset', expiry);
    for (const [body, proof] of [['retained body', 'valid-proof'], ['expired body', 'expired-proof'], ['replaced body', 'replaced-proof'], ['', null]]) {
      db.prepare("INSERT INTO mail_jobs(id,recipient,subject,body,created_at,next_attempt,status,token_hash) VALUES(?,?,?,?,?,?,'failed',?)")
        .run(randomUUID(), 'recipient@example.test', 'Retry test', body, Date.now(), 0, proof);
    }
    const before = f.messages.length;
    assert.equal((await f.request('/api/admin/mail-jobs/retry', {}, account.cookie)).body.count, 1);
    await f.app.flushMail();
    assert.equal(f.messages.length, before + 1);
    assert.equal(f.messages.at(-1).text, 'retained body');
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM mail_jobs WHERE status='failed'").get().count, 3);
  } finally { db.close(); }
});

test('mail rechecks tokens after another message has been delivered', async () => {
  for (const reason of ['replaced', 'expired']) {
    const db = openDatabase(':memory:');
    let clock = 1000;
    db.prepare('INSERT INTO users(id,name,email,password_hash,password_salt,created_at) VALUES(?,?,?,?,?,?)')
      .run('learner', 'Learner', 'learner@example.test', 'hash', 'salt', '2026-01-01');
    db.prepare('INSERT INTO account_tokens VALUES(?,?,?,?)').run('proof', 'learner', 'reset', 2000);
    const messages = [];
    const mailer = createMailer({ db, now: () => clock, smtp: null, production: false, logger: () => {}, deliverMail: message => {
      messages.push(message);
      if (reason === 'replaced') db.prepare('DELETE FROM account_tokens WHERE token_hash=?').run('proof');
      else clock = 2000;
    } });
    try {
      mailer.queue('learner@example.test', 'First', 'First message');
      mailer.queue('learner@example.test', 'Second', 'Sensitive code', 'proof');
      await mailer.flush();
      assert.equal(messages.length, 1, reason);
      assert.equal(db.prepare("SELECT body FROM mail_jobs WHERE status='failed'").get().body, '');
    } finally { await mailer.stop(); db.close(); }
  }
});

test('PDF ranges, caching and HEAD responses preserve file contents', async t => {
  const f = await fixture(t);
  const filename = fs.readdirSync(path.join(__dirname, '../PDFs')).find(name => name.startsWith('Evaluation'));
  const bytes = fs.readFileSync(path.join(__dirname, '../PDFs', filename));
  const url = f.origin + '/PDFs/' + encodeURIComponent(filename);
  const head = await fetch(url, { method: 'HEAD' });
  assert.equal(head.status, 200); assert.equal(Number(head.headers.get('content-length')), bytes.length);
  assert.equal(head.headers.get('accept-ranges'), 'bytes');
  for (const [range, start, end] of [['bytes=0-99', 0, 99], ['bytes=-10', bytes.length - 10, bytes.length - 1], [`bytes=${bytes.length - 8}-`, bytes.length - 8, bytes.length - 1]]) {
    const response = await fetch(url, { headers: { Range: range } });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('content-range'), `bytes ${start}-${end}/${bytes.length}`);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes.subarray(start, end + 1));
  }
  for (const range of [`bytes=${bytes.length}-`, 'bytes=10-5', 'bytes=-0']) {
    const response = await fetch(url, { headers: { Range: range } });
    assert.equal(response.status, 416); await response.arrayBuffer();
  }
  const cached = await fetch(url, { headers: { 'If-None-Match': '"other", ' + head.headers.get('etag') } });
  assert.equal(cached.status, 304);
  const modified = await fetch(url, { headers: { Range: 'bytes=0-9', 'If-Range': 'Thu, 01 Jan 1970 00:00:00 GMT' } });
  assert.equal(modified.status, 200); assert.deepEqual(Buffer.from(await modified.arrayBuffer()), bytes);
  const current = await fetch(url, { headers: { Range: 'bytes=0-9', 'If-Range': head.headers.get('last-modified') } });
  assert.equal(current.status, 206); await current.arrayBuffer();
});

test('all deployed pages and assets remain reachable with sensitive files excluded', async t => {
  const f = await fixture(t), account = await f.register();
  const root = path.join(__dirname, '..');
  const files = ['index.html'];
  function collect(relative) {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const name = relative + '/' + entry.name;
      if (entry.isDirectory()) collect(name);
      else if (/\.(?:html|js|css|svg|png|jpe?g|ttf)$/.test(name)) files.push(name);
    }
  }
  ['pages', 'scripts', 'styles', 'assets'].forEach(collect);
  for (const file of files) {
    const response = await fetch(f.origin + '/' + file, { method: 'HEAD', headers: { Cookie: account.cookie }, redirect: 'manual' });
    assert.equal(response.status, file === 'scripts/data/quizData.js' ? 404 : file === 'pages/admin.html' ? 302 : 200, file);
    if (response.status === 200) assert(Number(response.headers.get('content-length')) > 0, file);
  }
  for (const file of ['.env.example', 'package-lock.json', 'Dockerfile', 'tools/database-backup.js', 'output/print-samples/modules-complete.pdf', 'scratch/summary.json']) {
    assert.equal((await f.request('/' + file)).status, 404, file);
  }
  await Promise.all([f.app.shutdown(), f.app.shutdown()]);
  assert.equal(f.app.server.listening, false);
});
