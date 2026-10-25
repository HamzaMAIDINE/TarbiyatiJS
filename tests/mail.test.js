'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDatabase } = require('../backend/database');
const { createMailer } = require('../backend/mail');

async function workers(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tarbiyati-test-mail-'));
  let clock = Date.now(); const databases = [openDatabase(path.join(directory, 'mail.sqlite')), openDatabase(path.join(directory, 'mail.sqlite'))];
  const sent = []; const pending = [];
  const mailers = databases.map(db => createMailer({ db, now: () => clock, production: false, logger() {},
    deliverMail: message => new Promise(resolve => { sent.push(message); pending.push(resolve); }) }));
  t.after(async () => {
    for (const resolve of pending) resolve();
    await Promise.all(mailers.map(mailer => mailer.stop())); databases.forEach(db => db.close());
    assert(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return { databases, mailers, sent, pending, advance: ms => { clock += ms; } };
}

test('independent mail workers cannot deliver the same pending job concurrently', async t => {
  const f = await workers(t);
  f.mailers[0].queue('learner@example.test', 'Test subject', 'Private test message');
  const first = f.mailers[0].flush();
  const second = f.mailers[1].flush();
  assert.equal(f.sent.length, 1, 'one worker must reserve delivery before awaiting the transport');
  f.pending[0](); await Promise.all([first, second]);
  const row = f.databases[0].prepare('SELECT status,body,attempts FROM mail_jobs').get();
  assert.deepEqual({ ...row }, { status: 'sent', body: '', attempts: 1 });
});

test('an expired mail reservation can recover without a stale worker completing its replacement', async t => {
  const f = await workers(t);
  f.mailers[0].queue('learner@example.test', 'Test subject', 'Private test message');
  const first = f.mailers[0].flush(); f.advance(121000);
  const replacement = f.mailers[1].flush();
  assert.equal(f.sent.length, 2, 'an abandoned reservation becomes eligible again');
  f.pending[0](); await first;
  assert.equal(f.databases[0].prepare('SELECT status FROM mail_jobs').get().status, 'pending');
  f.pending[1](); await replacement;
  assert.equal(f.databases[0].prepare('SELECT status FROM mail_jobs').get().status, 'sent');
});
