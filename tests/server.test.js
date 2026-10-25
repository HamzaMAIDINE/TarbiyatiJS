'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../server');
const { quiz: QUIZ_DATA } = require('../backend/catalog');

test('accounts isolate progress, reject invalid writes, and persist across server restarts', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tarbiyati-test-'));
  const databasePath = path.join(directory, 'test.sqlite');
  let server;
  let app;
  let origin;
  async function start() {
    app = createApp({ databasePath, smtp: null }); server = app.server;
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    origin = `http://127.0.0.1:${server.address().port}`;
  }
  async function stop() { await new Promise(resolve => server.close(resolve)); await app.closed(); }
  t.after(async () => {
    if (server.listening) await stop();
    assert(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  await start();
  for (const route of ['/', '/index.html']) {
    const landing = await fetch(origin + route, { redirect: 'manual' });
    assert.equal(landing.status, 200, 'the landing page must be public');
    const content = await landing.text();
    assert.match(content, /landing-page/);
    assert(!content.includes('data-auth="loading"'));
  }
  const guestDashboard = await fetch(origin + '/pages/dashboard.html', { redirect: 'manual' });
  assert.equal(guestDashboard.status, 302);
  const guestPage = await fetch(origin + '/pages/modules.html', { redirect: 'manual' });
  assert.equal(guestPage.status, 302);
  assert.match(guestPage.headers.get('location'), /^\/pages\/account\.html\?next=/);
  async function request(route, data, cookie, extraHeaders = {}) {
    const response = await fetch(origin + route, {
      method: data === undefined ? 'GET' : 'POST',
      headers: { ...(data === undefined ? {} : { 'Content-Type': 'application/json', 'X-ScienceEdu-Request': '1', Origin: origin }), ...(cookie ? { Cookie: cookie } : {}), ...extraHeaders },
      body: data === undefined ? undefined : JSON.stringify(data)
    });
    return { status: response.status, cookie: response.headers.get('set-cookie'), body: await response.json() };
  }
  const credentialsA = { name: 'المتعلم الأول', email: 'learner-one@example.test', password: 'First-learner-password' };
  const credentialsB = { name: 'المتعلم الثاني', email: 'learner-two@example.test', password: 'Second-learner-password' };
  const a = await request('/api/auth/register', credentialsA);
  const b = await request('/api/auth/register', credentialsB);
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
  assert.match(a.cookie, /HttpOnly/);
  assert.match(a.cookie, /SameSite=Lax/);
  const cookieA = a.cookie.split(';')[0];
  const cookieB = b.cookie.split(';')[0];
  await app.flushMail();
  const messages = fs.readdirSync(path.join(directory,'mail')).map(filename=>fs.readFileSync(path.join(directory,'mail',filename),'utf8'));
  for (const credentials of [credentialsA,credentialsB]) {
    const message = messages.find(text=>text.includes(`To: ${credentials.email}`));
    const code = message.match(/^([0-9]{6})$/m)[1];
    assert.equal((await request('/api/auth/verify-email',{code},credentials === credentialsA ? cookieA : cookieB)).status,200);
  }
  assert.equal((await request('/api/progress')).status, 401);
  assert.equal((await request('/api/auth/register', credentialsA)).status, 409);
  assert.equal((await request('/api/auth/register', { ...credentialsB, email: 'short@example.test', password: 'short' })).status, 400);
  assert.equal((await request('/api/auth/login', { ...credentialsA, password: 'wrong-password' })).status, 401);
  assert.equal((await request('/api/progress', { type: 'module', id: 'mod-1', completed: true, operationId: randomUUID() }, cookieA, { Origin: 'https://other.example' })).status, 403);
  assert.equal((await request('/api/progress', { type: 'module', id: 'mod-999', completed: true, operationId: randomUUID() }, cookieA)).status, 400);
  assert.equal((await request('/api/progress', { type: 'quiz', score: 99, total: 2, operationId: randomUUID() }, cookieA)).status, 400);

  await Promise.all([
    request('/api/progress', { type: 'module', id: 'mod-1', completed: true, operationId: randomUUID() }, cookieA),
    request('/api/progress', { type: 'module', id: 'mod-2', completed: true, operationId: randomUUID() }, cookieA)
  ]);
  assert.equal((await request('/api/progress', { type: 'quiz', score: 90, total: 90, operationId: randomUUID() }, cookieA)).status, 400, 'client scores cannot create a quiz result');
  const attempt = (await request('/api/quizzes/start', { mode: 'exam', limit: '10', operationId: randomUUID() }, cookieA)).body.attempt;
  for (const [index, question] of attempt.questions.entries()) {
    const correct = QUIZ_DATA.find(item => item.id === question.id).correctAnswer;
    assert.equal((await request('/api/quizzes/answer', { attemptId: attempt.id, questionId: question.id, choice: index < 8 ? correct : (correct + 1) % 4 }, cookieA)).status, 200);
  }
  await request('/api/quizzes/submit', { attemptId: attempt.id }, cookieA);
  await request('/api/quizzes/submit', { attemptId: attempt.id }, cookieA);
  await request('/api/progress', { type: 'flashcard', id: 'fc-1', known: true, operationId: randomUUID() }, cookieA);
  await request('/api/progress', { type: 'simulator', id: 'sim-1', operationId: randomUUID() }, cookieA);
  await request('/api/progress', { type: 'mindmap', id: 'map-theories', operationId: randomUUID() }, cookieA);
  const own = (await request('/api/progress', undefined, cookieA)).body.progress;
  assert.deepEqual(own.completedModules.sort(), ['mod-1', 'mod-2']);
  assert.equal(own.quizzesTaken, 1, 'retrying an event must not duplicate a quiz');
  assert.equal(own.quizScore, 80);
  assert.deepEqual(own.masteredFlashcards, ['fc-1']);
  assert.deepEqual(own.simulatorCompleted, ['sim-1']);
  assert.deepEqual(own.mindmapsViewed, ['map-theories']);
  const other = (await request('/api/progress', undefined, cookieB)).body.progress;
  assert.deepEqual(other.completedModules, []);
  assert.equal(other.quizzesTaken, 0);
  await request('/api/progress', { type: 'module', id: 'mod-1', completed: false, operationId: randomUUID() }, cookieA);
  await request('/api/progress', { type: 'flashcard', id: 'fc-1', known: false, operationId: randomUUID() }, cookieA);
  assert.equal((await request('/api/progress', undefined, cookieA)).body.progress.flashcardsMastered, 0);
  assert.equal((await request('/api/auth/logout', {}, cookieA)).status, 200);
  assert.equal((await request('/api/progress', undefined, cookieA)).status, 401);
  await stop();
  await start();
  const login = await request('/api/auth/login', credentialsA);
  assert.equal(login.status, 200);
  assert.deepEqual(login.body.progress.completedModules, ['mod-2']);
  assert.deepEqual(login.body.progress.reviewFlashcards, ['fc-1']);
  assert.equal(login.body.progress.quizScore, 80);
  assert.equal(login.body.user.name, 'المتعلم الأول');
  // Passwords and session tokens must never be present in API responses.
  assert(!JSON.stringify(login.body).includes(credentialsA.password));
  assert.equal(login.body.user.password_hash, undefined);
  const privateFile = await fetch(origin + '/.data/scienceedu.sqlite');
  const serverSource = await fetch(origin + '/server.js');
  assert.equal(privateFile.status, 404);
  assert.equal(serverSource.status, 404);
});
