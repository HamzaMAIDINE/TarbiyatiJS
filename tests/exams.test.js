'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const catalog = require('../backend/catalog');
const sources = require('../content/exams/sources.json');
const { QuizSession } = require('../scripts/quiz-session');
const { fixture } = require('./helpers');

test('all three papers retain 60 ordered questions, source scans, bounded answer keys and module references', () => {
  assert.deepEqual(catalog.exams.map(exam => exam.year), [2023, 2024, 2025]);
  assert.deepEqual(catalog.exams.map(exam => exam.gradableCount), [60, 41, 46]);
  const moduleIds = new Set(catalog.modules.map(module => module.id));
  const all = catalog.exams.flatMap(exam => exam.questions);
  assert.equal(new Set(all.map(question => question.id)).size, 180);
  assert.equal(catalog.quiz.length, 249);
  assert.equal(new Set(catalog.quiz.map(question => question.id)).size, catalog.quiz.length);
  for (const exam of catalog.exams) {
    assert.deepEqual(exam.questions.map(question => question.number), Array.from({length:60}, (_,index) => index + 61));
    assert.equal(exam.durationMinutes, 120);
    for (const question of exam.questions) {
      assert.equal(question.options.length, exam.year === 2023 ? 4 : 5);
      assert.equal(new Set(question.options).size, question.options.length);
      assert(question.question && question.explanation && question.source && moduleIds.has(question.moduleId));
      assert(question.correctAnswer === null || Number.isInteger(question.correctAnswer) && question.correctAnswer >= 0 && question.correctAnswer < question.options.length);
      assert(fs.existsSync(path.join(__dirname, '..', question.sourcePage)));
      assert(!JSON.stringify(question).includes('\uFFFD'));
      assert.equal(catalog.quiz.some(item => item.id === question.id), question.correctAnswer !== null, 'unresolved questions are not shuffled into practice');
    }
  }
  for (const record of Object.values(sources)) {
    for (const scan of record.pages ? [...record.pages, ...record.corrections] : [record]) {
      const original = fs.readFileSync(path.join(__dirname, '..', 'QCM Exams', scan.originalFile));
      const preserved = fs.readFileSync(path.join(__dirname, '..', scan.url));
      assert.equal(createHash('sha256').update(preserved).digest('hex'), scan.sha256);
      assert(original.equals(preserved), 'scan assets preserve the supplied originals');
    }
  }
});

test('mixed four/five-choice practice shuffles safely and source filters retain only corrected questions', () => {
  for (const exam of catalog.exams) {
    const session = QuizSession.create(catalog.quiz, { source: exam.id, limit: 'all' });
    assert.equal(session.questions.length, exam.gradableCount);
    for (const question of session.questions) {
      assert.equal(question.sourceExamId, exam.id);
      assert(Number.isInteger(question.correctAnswer));
      assert.equal(question.presentedOptions.find(option => option.originalIndex === question.correctAnswer).text, question.options[question.correctAnswer]);
      assert.equal(question.presentedOptions.length, question.options.length);
    }
  }
  const training = QuizSession.create(catalog.quiz, { source: 'training', limit: 'all' });
  assert.equal(training.questions.length, 102);
  assert(training.questions.every(question => !question.sourceExamId));
  assert.equal(training.questions.filter(question => question.kind === 'situation').length, 60);
});

test('archive attempts preserve the paper, conceal corrections until submission, resume and exclude unresolved items', async t => {
  const clock = Date.now(); const f = await fixture(t, {now:()=>clock}); const user = await f.register(); const other = await f.register();
  assert.equal((await f.request('/api/exams')).status, 401);
  const library = (await f.request('/api/exams', undefined, user.cookie)).body.exams;
  assert.equal(library.length, 3);
  assert(library.every(exam => !exam.questions && !exam.correctionScans));
  for (const exam of catalog.exams) {
    const config = { mode:'exam', examId:exam.id, operationId:randomUUID() };
    const started = await f.request('/api/quizzes/start', config, user.cookie);
    assert.equal(started.status, 200);
    const attempt = started.body.attempt;
    assert.equal(attempt.deadline - attempt.serverTime, 120 * 60000);
    assert.deepEqual(attempt.questions.map(question => question.id), exam.questions.map(question => question.id));
    for (const [index, question] of attempt.questions.entries()) {
      assert.deepEqual(question.presentedOptions.map(option => option.text), exam.questions[index].options);
      for (const field of ['answer','correctAnswer','explanation','reviewNote','correctionStatus','lessonReferences','learningNote']) assert.equal(question[field], undefined);
    }
    assert.deepEqual((await f.request('/api/quizzes/start', config, user.cookie)).body.attempt.questions, attempt.questions);
    assert.equal((await f.request('/api/quizzes/attempt?id='+attempt.id, undefined, other.cookie)).status, 404);
    const q = exam.questions.find(question => question.correctAnswer !== null);
    await f.request('/api/quizzes/answer', { attemptId:attempt.id, questionId:q.id, choice:q.correctAnswer }, user.cookie);
    const unresolved = exam.questions.find(question => question.correctAnswer === null);
    if (unresolved) await f.request('/api/quizzes/answer', { attemptId:attempt.id, questionId:unresolved.id, choice:0 }, user.cookie);
    await f.stop(); await f.start();
    const resumed = (await f.request('/api/quizzes/active', undefined, user.cookie)).body.attempt;
    assert.equal(resumed.answers[q.id], q.correctAnswer);
    assert.equal(resumed.deadline, attempt.deadline);
    assert(resumed.questions.every(question => question.correctAnswer === undefined));
    const submitted = (await f.request('/api/quizzes/submit', { attemptId:attempt.id }, user.cookie)).body.attempt;
    assert.equal(submitted.result.score, 1);
    assert.equal(submitted.result.total, exam.gradableCount);
    assert.equal(submitted.result.questionCount, 60);
    assert.equal(submitted.result.percent, Math.round(100 / exam.gradableCount));
    assert(submitted.questions.every(question => question.explanation && question.source && question.correctAnswer !== undefined));
    assert(submitted.questions.every(question => question.lessonReferences?.[0].sectionId.includes('-s') && question.learningNote));
    if (unresolved) assert.equal(submitted.questions.find(question => question.id === unresolved.id).correctAnswer, null);
    assert.equal(submitted.exam.correctionScans.length, exam.correctionScans.length);
    await f.request('/api/quizzes/submit', { attemptId:attempt.id }, user.cookie);
  }
  const history = (await f.request('/api/quizzes/history', undefined, user.cookie)).body.attempts;
  assert.equal(history.length, 3); assert(history.every(attempt => attempt.examId));
  assert.equal((await f.request('/api/progress', undefined, user.cookie)).body.progress.quizzesTaken, 3);
  assert.equal((await f.request('/api/quizzes/start', {mode:'practice',examId:'exam-2023',operationId:randomUUID()},user.cookie)).status,400);
  assert.equal((await f.request('/api/quizzes/start', {mode:'exam',examId:'missing',operationId:randomUUID()},user.cookie)).status,400);
  const practice = (await f.request('/api/quizzes/start', {mode:'practice',source:'exam-2025',limit:'all',operationId:randomUUID()},user.cookie)).body.attempt;
  assert.equal(practice.questions.length, 46); assert(practice.questions.every(question => question.sourceExamId === 'exam-2025'));
  assert.equal((await f.request('/content/exams/2025.json',undefined,user.cookie)).status,404);
  assert.equal((await f.request('/scripts/data/quizData.js',undefined,user.cookie)).status,404);
  const image = await fetch(f.origin + '/assets/exams/2025/page-01.jpg');
  assert.equal(image.status,200); assert.equal(image.headers.get('content-type'),'image/jpeg');
});

test('archived exam deadlines stay fixed and expired answers cannot change the result', async t => {
  let clock = Date.now(); const f = await fixture(t, {now:()=>clock}); const user = await f.register();
  const attempt = (await f.request('/api/quizzes/start',{mode:'exam',examId:'exam-2024',operationId:randomUUID()},user.cookie)).body.attempt;
  clock = attempt.deadline;
  const late = (await f.request('/api/quizzes/answer',{attemptId:attempt.id,questionId:attempt.questions[0].id,choice:0},user.cookie)).body.attempt;
  assert.equal(late.status,'submitted'); assert.equal(late.result.score,0); assert.equal(late.result.total,41);
  assert.deepEqual(late.answers,{});
});

test('paused papers freeze server time, survive restarts and coexist with quizzes and other papers', async t => {
  let clock = Date.now(); const f = await fixture(t, {now:()=>clock}); const user = await f.register(); const other = await f.register();
  const start = async (body) => (await f.request('/api/quizzes/start', {...body,operationId:randomUUID()},user.cookie)).body.attempt;
  const first = await start({mode:'exam',examId:'exam-2023'});
  const answer = {attemptId:first.id,questionId:2023061,choice:2,currentIndex:39};
  await f.request('/api/quizzes/answer',answer,user.cookie);
  clock += 5 * 60000;
  const pauseBody = {attemptId:first.id,version:first.version,currentIndex:39};
  assert.equal((await f.request('/api/quizzes/pause',pauseBody)).status,401);
  assert.equal((await f.request('/api/quizzes/pause',pauseBody,other.cookie)).status,404);
  assert.equal((await f.request('/api/quizzes/pause',{...pauseBody,currentIndex:60},user.cookie)).status,400);
  const paused = (await f.request('/api/quizzes/pause',pauseBody,user.cookie)).body.attempt;
  assert.equal(paused.status,'paused'); assert.equal(paused.deadline,null); assert.equal(paused.remainingMs,115*60000);
  assert.equal(paused.currentIndex,39); assert.equal(paused.answers[2023061],2);
  assert(paused.questions.every(question=>question.correctAnswer===undefined&&question.explanation===undefined));
  assert.equal((await f.request('/api/quizzes/answer',answer,user.cookie)).body.code,'EXAM_PAUSED');
  assert.equal((await f.request('/api/quizzes/submit',{attemptId:first.id},user.cookie)).body.code,'EXAM_PAUSED');
  clock += 2*86400000;
  f.app.maintenance(); await f.stop(); await f.start();
  assert.equal((await f.request('/api/quizzes/pause',pauseBody,user.cookie)).body.attempt.remainingMs,paused.remainingMs,'repeated pause does not drain or reset time');
  const stopped = (await f.request('/api/quizzes/active?scope=exams',undefined,user.cookie)).body;
  assert.equal(stopped.attempt,null); assert.equal(stopped.sessions[0].status,'paused');
  assert.equal(stopped.sessions[0].currentIndex,39);
  assert.equal((await f.request('/api/quizzes/active?scope=exams',undefined,other.cookie)).body.sessions.length,0);
  assert.equal((await f.request('/api/progress',undefined,user.cookie)).body.progress.quizzesTaken,0);
  const quiz = await start({mode:'practice',limit:'10'});
  await f.request('/api/quizzes/answer',{attemptId:quiz.id,questionId:quiz.questions[0].id,choice:0},user.cookie);
  const second = await start({mode:'exam',examId:'exam-2024'});
  const resumeBody = {attemptId:first.id,version:paused.version,remainingMs:999999999};
  assert.equal((await f.request('/api/quizzes/resume',resumeBody,other.cookie)).status,404);
  const resumed = (await f.request('/api/quizzes/resume',resumeBody,user.cookie)).body.attempt;
  assert.equal(resumed.status,'active'); assert.equal(resumed.deadline,clock+paused.remainingMs,'client cannot supply more time');
  assert.deepEqual(resumed.answers,paused.answers); assert.equal(resumed.currentIndex,39);
  assert.equal((await f.request('/api/quizzes/attempt?id='+second.id,undefined,user.cookie)).body.attempt.status,'paused','resuming one paper preserves the other');
  const activeQuiz = (await f.request('/api/quizzes/active?scope=quiz',undefined,user.cookie)).body.attempt;
  assert.equal(activeQuiz.id,quiz.id); assert.equal(Object.keys(activeQuiz.answers).length,1,'resuming a paper does not discard the practice quiz');
  clock += 60000;
  assert.equal((await f.request('/api/quizzes/resume',resumeBody,user.cookie)).body.attempt.deadline,resumed.deadline,'duplicate resume cannot extend the deadline');
  assert.equal((await f.request('/api/quizzes/pause',pauseBody,user.cookie)).body.code,'EXAM_STATE_CHANGED','stale tabs cannot replay an earlier pause after resuming');
  const pausedAgain = (await f.request('/api/quizzes/pause',{attemptId:first.id,version:resumed.version},user.cookie)).body.attempt;
  assert.equal(pausedAgain.remainingMs,114*60000);
  assert.equal((await f.request('/api/quizzes/resume',resumeBody,user.cookie)).body.code,'EXAM_STATE_CHANGED');
  await f.request('/api/quizzes/resume',{attemptId:first.id,version:pausedAgain.version},user.cookie);
  const result = (await f.request('/api/quizzes/submit',{attemptId:first.id},user.cookie)).body.attempt;
  assert.equal(result.result.score,1); assert.equal(result.result.total,60);
  await f.request('/api/quizzes/submit',{attemptId:first.id},user.cookie);
  assert.equal((await f.request('/api/progress',undefined,user.cookie)).body.progress.quizzesTaken,1);
});

test('starting quizzes pauses papers instead of abandoning them, and expired papers cannot gain time', async t => {
  let clock = Date.now(); const f = await fixture(t, {now:()=>clock}); const user = await f.register();
  const start = async body => (await f.request('/api/quizzes/start',{...body,operationId:randomUUID()},user.cookie)).body.attempt;
  const paper = await start({mode:'exam',examId:'exam-2025'});
  clock += 100000;
  const quiz = await start({mode:'practice',limit:'10'});
  const paused = (await f.request('/api/quizzes/attempt?id='+paper.id,undefined,user.cookie)).body.attempt;
  assert.equal(paused.status,'paused'); assert.equal(paused.remainingMs,120*60000-100000);
  assert.equal((await start({mode:'exam',examId:'exam-2025'})).id,paper.id,'starting the same unfinished paper preserves it');
  assert.equal((await f.request('/api/quizzes/pause',{attemptId:quiz.id,version:0},user.cookie)).status,400);
  assert.equal((await f.request('/api/quizzes/active?scope=unknown',undefined,user.cookie)).status,400);
  const resumed = (await f.request('/api/quizzes/resume',{attemptId:paper.id,version:paused.version},user.cookie)).body.attempt;
  clock = resumed.deadline;
  const expired = (await f.request('/api/quizzes/pause',{attemptId:paper.id,version:resumed.version},user.cookie)).body.attempt;
  assert.equal(expired.status,'submitted'); assert.equal(expired.result.score,0);
  assert.equal((await f.request('/api/quizzes/resume',{attemptId:paper.id,version:resumed.version},user.cookie)).body.attempt.status,'submitted');
  assert.equal((await f.request('/api/progress',undefined,user.cookie)).body.progress.quizzesTaken,1);
});
