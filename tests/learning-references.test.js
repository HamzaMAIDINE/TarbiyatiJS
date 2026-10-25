'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const catalog = require('../backend/catalog');
const { CURRICULUM_ALIASES } = require('../scripts/data/curriculumData');
const { fixture } = require('./helpers');
const { html } = require('../scripts/lesson-references');
const root = path.join(__dirname, '..');

test('each study section has a stable anchor and inspectable source; all questions reach their concept', () => {
  const sections = new Map();
  for (const module of catalog.modules) for (const section of module.sections) {
    assert(section.id.startsWith(module.id + '-s'));
    assert(!sections.has(section.id)); sections.set(section.id, section);
    assert(section.objectives.length >= 2);
    assert(section.selfCheck.prompt && section.selfCheck.answer, 'self-checks have explained answers in the lesson');
    assert(section.sources.length > 0, section.title);
    assert(section.content.includes('مثال محلل') || section.content.includes('تطبيق خطوة بخطوة'), section.title);
    for (const source of section.sources) {
      assert(source.title && source.locator);
      if (source.document) {
        const filename = path.join(root, decodeURIComponent(source.url.split('#')[0]));
        assert(fs.existsSync(filename), filename);
        assert(source.firstPage >= 1 && source.lastPage >= source.firstPage);
        assert(source.url.endsWith('#page=' + source.firstPage));
      } else assert(source.url.startsWith('https://'));
    }
  }
  for (const question of [...catalog.quiz, ...catalog.exams.flatMap(exam => exam.questions)]) {
    assert(question.learningNote, question.id);
    assert(question.lessonReferences.length > 0, question.id);
    assert.equal(question.category, catalog.modules.find(module => module.id === question.moduleId).questionCategory);
    for (const reference of question.lessonReferences) {
      assert(sections.has(reference.sectionId), question.id);
      assert(reference.sectionId.startsWith(question.moduleId + '-'));
      assert(reference.sources.length > 0);
    }
  }
});

test('moved concepts have one primary home and old lesson links resolve to it', () => {
  const all = new Map(catalog.modules.flatMap(module => module.sections.map(section => [section.id, section])));
  for (const [oldId, newId] of Object.entries(CURRICULUM_ALIASES)) {
    assert(!all.has(oldId), 'moved lesson is not duplicated under its previous module');
    assert(all.has(newId));
  }
  const expected = [[9,'mod-2-s9'], [11,'mod-6-s2'], [15,'mod-4-s8'], [20,'mod-6-s6'],
    [25,'mod-3-s9'], [38,'mod-3-s6'], [40,'mod-3-s11'], [61,'mod-4-s10'],
    [2023083,'mod-4-s6'], [2023108,'mod-2-s10'], [2023116,'mod-3-s3'],
    [2023120,'mod-3-s10'], [2024078,'mod-4-s6'], [2024082,'mod-4-s7'],
    [2024088,'mod-2-s9'], [2024097,'mod-3-s5'], [2024117,'mod-2-s11'],
    [2025064,'mod-4-s7'], [2025080,'mod-2-s2'], [2025098,'mod-6-s6'], [2025103,'mod-3-s5']];
  const questions = new Map([...catalog.quiz,...catalog.exams.flatMap(exam => exam.questions)].map(question => [question.id,question]));
  for (const [id,target] of expected) assert.equal(questions.get(id).lessonReferences[0].sectionId,target,String(id));
  for (const module of catalog.modules) for (const section of module.sections) {
    for (const link of section.content.matchAll(/href="#(mod-\d+-s\d+)"/g)) assert(all.has(CURRICULUM_ALIASES[link[1]] || link[1]),link[1]);
  }
});

test('curriculum placement preserves the original question wording, options and answer keys', () => {
  for (const exam of catalog.exams) {
    const source = require('../content/exams/' + exam.year + '.json');
    for (const question of exam.questions) {
      const original = source.questions.find(item => item.number === question.number);
      assert.equal(question.question,original.question);
      assert.deepEqual(question.options,original.options);
      assert.equal(question.correctAnswer,original.answer === null ? null : 'ABCDE'.indexOf(original.answer));
      assert.equal(question.moduleId,original.moduleId,'source metadata follows the primary lesson');
    }
  }
});

test('previously missing exam subjects have substantive lessons rather than generic module links', () => {
  const cases = [[2023072, 'بودون'], [2024068, 'الرأسمال الثقافي'], [2024094, 'برنشتاين'],
    [2025062, 'ستانلي هول'], [2025084, 'مبدأ التناظر'], [2025100, 'الذاكرة العاملة'],
    [2025116, 'السوسيوغرام'], [2025118, 'بارسنز']];
  const questions = new Map(catalog.exams.flatMap(exam => exam.questions).map(question => [question.id, question]));
  const sections = new Map(catalog.modules.flatMap(module => module.sections.map(section => [section.id, section])));
  for (const [id, concept] of cases) {
    const section = sections.get(questions.get(id).lessonReferences[0].sectionId);
    assert(section.content.includes(concept), `${id}: ${concept}`);
  }
  assert.equal(questions.get(2024094).correctAnswer, null, 'adding concept coverage does not invent a key');
});

test('learning reference markup escapes source and section text', () => {
  const rendered = html({ learningNote:'<img src=x onerror=alert(1)>', lessonReferences:[{
    title:'<script>bad()</script>', sectionId:'mod-1-s1', sources:[{title:'A & B',url:'/PDFs/a.pdf#page=2',locator:'2'}]
  }] });
  assert(!rendered.includes('<script>')); assert(!rendered.includes('<img'));
  assert(rendered.includes('&amp;')); assert(rendered.includes('modules.html#mod-1-s1'));
});

test('practice feedback supplies sources only after answering and refreshes links for saved attempts', async t => {
  const f = await fixture(t); const user = await f.register();
  const started = await f.request('/api/quizzes/start', {mode:'practice',source:'training',limit:'10',operationId:randomUUID()}, user.cookie);
  const attempt = started.body.attempt; const question = attempt.questions[0];
  assert(attempt.questions.every(question => question.lessonReferences === undefined && question.learningNote === undefined));
  const db = new DatabaseSync(path.join(f.directory, 'test.sqlite'));
  let stored;
  try {
    stored = JSON.parse(db.prepare('SELECT questions FROM quiz_attempts WHERE id=?').get(attempt.id).questions);
    for (const item of stored) { delete item.lessonReferences; delete item.learningNote; item.moduleId='mod-1'; item.category='Old category'; }
    db.prepare('UPDATE quiz_attempts SET questions=? WHERE id=?').run(JSON.stringify(stored), attempt.id);
  } finally { db.close(); }
  const answer = await f.request('/api/quizzes/answer', {attemptId:attempt.id,questionId:question.id,choice:0}, user.cookie);
  assert.equal(answer.status, 200);
  const reviewed = answer.body.attempt.questions.find(item => item.id === question.id);
  assert(reviewed.lessonReferences[0].sectionId.includes('-s'));
  assert(reviewed.lessonReferences[0].sources.length > 0);
  assert.equal(reviewed.correctAnswer, stored.find(item => item.id === question.id).correctAnswer);
  assert.equal(reviewed.moduleId, catalog.quiz.find(item => item.id === question.id).moduleId);
  assert.equal(reviewed.category, catalog.quiz.find(item => item.id === question.id).category);
  assert(answer.body.attempt.questions.filter(item => item.id !== question.id).every(item => item.lessonReferences === undefined));
  const source = reviewed.lessonReferences[0].sources.find(item => item.document);
  if (source) {
    const response = await f.request(source.url.split('#')[0]);
    assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /application\/pdf/);
  }
  await f.request('/api/quizzes/submit',{attemptId:attempt.id},user.cookie);
  const history = (await f.request('/api/quizzes/history',undefined,user.cookie)).body;
  const categories = new Set(catalog.modules.map(module=>module.questionCategory));
  assert(history.weaknesses.length > 0);
  assert(history.weaknesses.every(item=>categories.has(item.category)),'history also uses current module labels');
});
