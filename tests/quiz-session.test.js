'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { QUIZ_DATA } = require('../scripts/data/quizData');
const { SIMULATOR_DATA } = require('../scripts/data/simulatorData');
const { QuizSession } = require('../scripts/quiz-session');

test('question and situation banks have complete, distinct records and valid answer keys', () => {
  assert.equal(QUIZ_DATA.length, 102);
  assert.equal(new Set(QUIZ_DATA.map(question => question.id)).size, QUIZ_DATA.length);
  assert.equal(new Set(QUIZ_DATA.map(question => question.question)).size, QUIZ_DATA.length);
  assert.equal(QUIZ_DATA.filter(question => question.kind === 'situation').length, 60);
  for (const question of QUIZ_DATA) {
    assert.equal(question.options.length, 4, `question ${question.id}`);
    assert.equal(new Set(question.options).size, 4, `duplicate choices for ${question.id}`);
    assert(Number.isInteger(question.correctAnswer) && question.correctAnswer >= 0 && question.correctAnswer < 4);
    assert(question.explanation && question.source);
    if (question.kind === 'situation') assert(question.scenario && question.moduleId);
    if (question.id > 30) assert.match(question.source, /تدريبي مؤلف/);
  }
  assert.equal(SIMULATOR_DATA.length, 14);
  assert.equal(new Set(SIMULATOR_DATA.map(scenario => scenario.id)).size, SIMULATOR_DATA.length);
  for (const scenario of SIMULATOR_DATA) {
    assert.equal(scenario.options.length, 4);
    assert(scenario.scenario && scenario.pedagogicalAction && scenario.reference);
    const correct = scenario.options.find(option => option.id === scenario.correctId);
    assert(correct && correct.score === 10);
    assert(scenario.options.every(option => option.feedback));
  }
});

test('shuffling preserves every original answer key without changing the source bank', () => {
  const snapshot = JSON.stringify(QUIZ_DATA);
  for (let seed = 1; seed <= 50; seed++) {
    let state = seed;
    const random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
    const { questions } = QuizSession.create(QUIZ_DATA, { limit: 20 }, random);
    assert.equal(questions.length, 20);
    assert.equal(new Set(questions.map(question => question.id)).size, 20);
    const answers = {};
    for (const question of questions) {
      assert.deepEqual(question.presentedOptions.map(option => option.originalIndex).sort(), [0, 1, 2, 3]);
      const correct = question.presentedOptions.find(option => option.originalIndex === question.correctAnswer);
      assert.equal(correct.text, question.options[question.correctAnswer]);
      answers[question.id] = correct.originalIndex;
    }
    assert.equal(QuizSession.score(questions, answers), 20);
    delete answers[questions[0].id];
    assert.equal(QuizSession.score(questions, answers), 19);
    answers[questions[0].id] = (questions[0].correctAnswer + 1) % 4;
    assert.equal(QuizSession.score(questions, answers), 19);
  }
  assert.equal(JSON.stringify(QUIZ_DATA), snapshot);
});

test('session filters are respected, short pools remain unique, and empty combinations stay empty', () => {
  const categories = [...new Set(QUIZ_DATA.map(question => question.category))];
  for (const category of categories) {
    const { questions, poolSize } = QuizSession.create(QUIZ_DATA, { category, kind: 'situation', limit: 30 });
    assert(poolSize > 0);
    assert.equal(questions.length, poolSize);
    assert(questions.every(question => question.category === category && question.kind === 'situation'));
  }
  const { questions } = QuizSession.create(QUIZ_DATA, { difficulty: 'متقدم', limit: 10 });
  assert(questions.every(question => question.difficulty === 'متقدم'));
  assert.equal(QuizSession.create(QUIZ_DATA, { category: 'missing' }).questions.length, 0);
});

test('a new attempt differs from the previous order even when the random source repeats', () => {
  const first = QuizSession.create(QUIZ_DATA, { limit: 10 }, () => .5).questions;
  const second = QuizSession.create(QUIZ_DATA, { limit: 10, previousIds: first.map(question => question.id) }, () => .5).questions;
  assert.notDeepEqual(second.map(question => question.id), first.map(question => question.id));
  assert.deepEqual([...second.map(question => question.id)].sort(), [...first.map(question => question.id)].sort());
});
