'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { fork } = require('node:child_process');
const { once } = require('node:events');
const { DatabaseSync } = require('node:sqlite');
const { fixture, verificationCode } = require('./helpers');
const { DRAFT_FIELDS } = require('../backend/learning');

async function race(t, f, job, count = 3, beforeRelease = () => {}) {
  const databasePath = path.join(f.directory, 'test.sqlite');
  // Stop this fixture's hourly/queue timers before holding a writer lock in its
  // own event loop; only the independent service processes should contend.
  await f.stop();
  const workers = await Promise.all(Array.from({ length: count }, async () => {
    const child = fork(path.join(__dirname, 'concurrency-worker.cjs'), { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    let errors = ''; child.stderr.on('data', data => { errors += data; });
    t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill(); });
    const ready = once(child, 'message'); child.send({ databasePath });
    assert.equal((await ready)[0].ready, true, errors);
    return child;
  }));
  const writer = new DatabaseSync(databasePath);
  writer.exec('PRAGMA busy_timeout=5000; BEGIN IMMEDIATE');
  // A real competing writer holds the lock while service requests arrive. WAL
  // permits reads: checking state outside a transaction would see stale data.
  const results = workers.map(async child => {
    const result = once(child, 'message'); const exited = once(child, 'exit');
    child.send(job); const [message] = await result; await exited; return message;
  });
  try {
    await new Promise(resolve => setTimeout(resolve, 700));
    beforeRelease(writer); writer.exec('COMMIT');
    return await Promise.all(results);
  } finally { if (writer.isTransaction) writer.exec('ROLLBACK'); writer.close(); await f.start(); }
}

test('separate Node processes cannot overspend a persistent quota or replay learning writes', async t => {
  const f = await fixture(t); const account = await f.register(); const userId = account.body.user.id;
  const quota = await race(t, f, { operation: 'limit', key: 'parallel-quota', maximum: 2 }, 4);
  assert.equal(quota.filter(result => result.status === 200).length, 2, JSON.stringify(quota));
  assert.equal(quota.filter(result => result.status === 429).length, 2);
  const event = { operationId: randomUUID(), type: 'flashcard', id: require('../backend/catalog').flashcards[0].id, known: true };
  const replay = await race(t, f, { operation: 'event', userId, event });
  assert(replay.every(result => result.status === 200), JSON.stringify(replay));
  assert(replay.every(result => result.body.flashcardsMastered === 1));
});

test('separate Node processes submit a stored quiz exactly once', async t => {
  const f = await fixture(t); const account = await f.register(); const userId = account.body.user.id;
  const attempt = (await f.request('/api/quizzes/start', { operationId: randomUUID(), mode: 'exam', limit: '10' }, account.cookie)).body.attempt;
  const results = await race(t, f, { operation: 'submit', userId, attemptId: attempt.id });
  assert(results.every(result => result.status === 200), JSON.stringify(results));
  assert(results.every(result => result.body.progress.quizzesTaken === 1), 'one submitted quiz must only count once');
  assert.equal((await f.request('/api/progress', undefined, account.cookie)).body.progress.quizzesTaken, 1);
});

test('a verification proof is consumed once across Node processes', async t => {
  const f = await fixture(t); const account = await f.register(undefined, { verify: false });
  await f.app.flushMail(); const code = verificationCode(f.messages.at(-1));
  const results = await race(t, f, { operation: 'verify', cookie: account.cookie, code });
  assert.equal(results.filter(result => result.status === 200).length, 1);
  assert.equal(results.filter(result => result.status === 400).length, 2);
});

test('a stale draft deletion cannot erase a newer committed save', async t => {
  const f = await fixture(t); const account = await f.register();
  const id = randomUUID(); const fields = Object.fromEntries(DRAFT_FIELDS.map(key => [key, key === 'title' ? 'Original lesson' : '']));
  assert.equal((await f.request('/api/drafts/save', { id, version: 0, fields }, account.cookie)).status, 200);
  const results = await race(t, f, { operation: 'delete', userId: account.body.user.id, id, version: 1 }, 1,
    writer => writer.prepare('UPDATE lesson_drafts SET version=2,title=? WHERE id=?').run('Newer lesson', id));
  assert.equal(results[0].status, 409);
  assert.equal((await f.request('/api/drafts/detail?id=' + id, undefined, account.cookie)).body.draft.version, 2);
});
