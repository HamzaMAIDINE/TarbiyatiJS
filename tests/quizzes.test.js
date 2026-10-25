'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { fixture } = require('./helpers');
const { quiz: QUIZ_DATA } = require('../backend/catalog');
const key = id => QUIZ_DATA.find(question => question.id === id).correctAnswer;

test('exam attempts hide keys, resume stable choices, reject foreign answers and count submission once', async t => {
  const f = await fixture(t); const a = await f.register(); const b = await f.register();
  const config = {mode:'exam',limit:'10',operationId:randomUUID()};
  const started = await f.request('/api/quizzes/start',config,a.cookie); const attempt = started.body.attempt;
  assert.equal(started.status,200); assert.equal(attempt.questions.length,10);
  assert(!JSON.stringify(attempt).includes('correctAnswer')); assert(!JSON.stringify(attempt).includes('explanation')); assert(!JSON.stringify(attempt).includes('score'));
  assert.deepEqual((await f.request('/api/quizzes/start',config,a.cookie)).body.attempt.questions,attempt.questions);
  assert.equal((await f.request('/api/quizzes/start',{...config,mode:'practice'},a.cookie)).status,409);
  assert.equal((await f.request('/api/quizzes/attempt?id='+attempt.id,undefined,b.cookie)).status,404);
  const q = attempt.questions[0];
  assert.equal((await f.request('/api/quizzes/answer',{attemptId:attempt.id,questionId:q.id,choice:key(q.id)},b.cookie)).status,404);
  assert.equal((await f.request('/api/quizzes/answer',{attemptId:attempt.id,questionId:9999,choice:0},a.cookie)).status,400);
  assert.equal((await f.request('/api/quizzes/answer',{attemptId:attempt.id,questionId:q.id,choice:q.presentedOptions.length},a.cookie)).status,400);
  await f.request('/api/quizzes/answer',{attemptId:attempt.id,questionId:q.id,choice:(key(q.id)+1)%4,currentIndex:2},a.cookie);
  const answered = await f.request('/api/quizzes/answer',{attemptId:attempt.id,questionId:q.id,choice:key(q.id),currentIndex:2},a.cookie);
  assert(!JSON.stringify(answered.body.attempt).includes('correctAnswer'));
  await f.stop(); await f.start();
  const resumed = (await f.request('/api/quizzes/active',undefined,a.cookie)).body.attempt;
  assert.deepEqual(resumed.questions,attempt.questions); assert.equal(resumed.answers[q.id],key(q.id)); assert.equal(resumed.currentIndex,2); assert.equal(resumed.deadline,attempt.deadline);
  const final = await f.request('/api/quizzes/submit',{attemptId:attempt.id,score:10},a.cookie);
  assert.equal(final.body.attempt.result.score,1); assert(final.body.attempt.questions.every(q=>q.correctAnswer!==undefined));
  await Promise.all(Array.from({length:5},()=>f.request('/api/quizzes/submit',{attemptId:attempt.id},a.cookie)));
  const progress = (await f.request('/api/progress',undefined,a.cookie)).body.progress;
  assert.equal(progress.quizzesTaken,1); assert.equal(progress.quizScore,10);
  const history = (await f.request('/api/quizzes/history',undefined,a.cookie)).body;
  assert.equal(history.attempts.length,1); assert(history.weaknesses.length>0);
  assert.equal((await f.request('/api/quizzes/history',undefined,b.cookie)).body.attempts.length,0);
});

test('expired exams reject late answers and refreshing cannot extend the server deadline', async t => {
  let clock = Date.now(); const f = await fixture(t,{now:()=>clock}); const user = await f.register();
  const first = (await f.request('/api/quizzes/start',{mode:'exam',limit:'10',operationId:randomUUID()},user.cookie)).body.attempt;
  clock = first.deadline - 1;
  await f.request('/api/quizzes/answer',{attemptId:first.id,questionId:first.questions[0].id,choice:key(first.questions[0].id)},user.cookie);
  clock = first.deadline;
  const late = await f.request('/api/quizzes/answer',{attemptId:first.id,questionId:first.questions[1].id,choice:key(first.questions[1].id)},user.cookie);
  assert.equal(late.body.attempt.status,'submitted'); assert.equal(late.body.attempt.result.score,1);
  assert.equal(late.body.attempt.answers[first.questions[1].id],undefined);
  await f.request('/api/quizzes/submit',{attemptId:first.id},user.cookie);
  assert.equal((await f.request('/api/progress',undefined,user.cookie)).body.progress.quizzesTaken,1);
  const second = (await f.request('/api/quizzes/start',{mode:'exam',limit:'10',operationId:randomUUID()},user.cookie)).body.attempt;
  clock = second.deadline + 1000;
  assert.equal((await f.request('/api/quizzes/active',undefined,user.cookie)).body.attempt.result.score,0);
  assert.equal((await f.request('/api/progress',undefined,user.cookie)).body.progress.quizzesTaken,2);
});

test('practice corrects only accepted answers and locks them; filters and empty pools remain valid', async t => {
  const f = await fixture(t); const user = await f.register();
  const category = QUIZ_DATA[0].category;
  const attempt = (await f.request('/api/quizzes/start',{mode:'practice',category,kind:'concept',limit:'10',operationId:randomUUID()},user.cookie)).body.attempt;
  assert(attempt.questions.every(q=>q.category===category&&q.kind==='concept'));
  const question = attempt.questions[0]; assert.equal(question.correctAnswer,undefined);
  const payload = {attemptId:attempt.id,questionId:question.id,choice:0};
  const result = (await f.request('/api/quizzes/answer',payload,user.cookie)).body.attempt;
  assert.equal(result.questions[0].correctAnswer,key(question.id));
  assert(result.questions.slice(1).every(q=>q.correctAnswer===undefined));
  assert.equal((await f.request('/api/quizzes/answer',payload,user.cookie)).status,200);
  assert.equal((await f.request('/api/quizzes/answer',{...payload,choice:1},user.cookie)).status,409);
  assert.equal((await f.request('/api/quizzes/start',{mode:'practice',category:'unknown',operationId:randomUUID()},user.cookie)).status,400);
  let empty;
  for (const cat of new Set(QUIZ_DATA.map(q=>q.category))) for (const diff of new Set(QUIZ_DATA.map(q=>q.difficulty))) for (const kind of ['concept','situation']) {
    if (!QUIZ_DATA.some(q=>q.category===cat&&q.difficulty===diff&&(q.kind||'concept')===kind)) empty={category:cat,difficulty:diff,kind};
  }
  assert(empty);
  const none = await f.request('/api/quizzes/start',{mode:'practice',limit:'10',operationId:randomUUID(),...empty},user.cookie);
  assert.equal(none.status,200); assert.equal(none.body.attempt,null);
});
