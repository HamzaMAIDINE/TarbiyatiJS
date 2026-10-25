'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const catalog = require('../backend/catalog');
const { CURRICULUM_ALIASES } = require('../scripts/data/curriculumData');
const { validateLearningContent } = require('../backend/validate-learning-content');
const { DRAFT_FIELDS } = require('../backend/learning');
const { fixture } = require('./helpers');

test('all modules have applied workshops and all mind map concepts have exact, connected lesson targets', () => {
  assert.deepEqual(validateLearningContent(catalog, { aliases: CURRICULUM_ALIASES }), { modules: 8, sections: 53, workshops: 8, mindmaps: 5, branches: 40 });
  const practice = catalog.mindmaps.find(map => map.id === 'map-practice');
  assert.deepEqual(Array.from(practice.root.branches, branch => branch.moduleId), catalog.modules.map(module => module.id));
  for (const module of catalog.modules) {
    assert.equal(new Set(module.workshop.sectionIds).size, module.workshop.sectionIds.length);
    assert.equal(practice.root.branches.find(branch => branch.id === module.workshop.branchId).moduleId, module.id);
  }
});

test('catalog rejects broken content before serving learners', () => {
  const cases = [
    [copy => { copy.modules[0].sections[0].id = copy.modules[0].sections[1].id; }, /duplicate or invalid lesson ID/],
    [copy => { copy.modules[0].sections[0].selfCheck.answer = ''; }, /self-check/],
    [copy => { copy.modules[0].sections[0].content += '<a href="#mod-99-s1">missing</a>'; }, /broken lesson link/],
    [copy => { copy.modules[0].sections[0].sources[0].url = 'javascript:alert(1)'; }, /unsafe source URL/],
    [copy => { copy.modules[0].sections[0].sources[0].url = '/PDFs/missing.pdf'; }, /local source does not exist/],
    [copy => { copy.modules[0].sections[0].sources[0].firstPage = 0; }, /invalid PDF locator/],
    [copy => { copy.modules[0].workshop.sectionIds = ['mod-99-s1']; }, /broken workshop lesson/],
    [copy => { copy.modules[0].workshop.answer.pop(); }, /applied workshop is incomplete/],
    [copy => { copy.modules[0].workshop.branchId = 'b-practice-observation'; }, /broken workshop mind map/],
    [copy => { copy.mindmaps[0].root.branches[0].sectionId = 'mod-2-s1'; }, /lesson target does not match/],
    [copy => { copy.mindmaps[0].root.branches[1].id = copy.mindmaps[0].root.branches[0].id; }, /duplicate or invalid branch ID/],
    [copy => { copy.mindmaps[0].root.branches[0].related[0].branchId = 'b-missing'; }, /broken or duplicate concept relationship/],
    [copy => { copy.mindmaps[0].root.branches[0].related[0].branchId = 'b-behaviorism'; }, /broken or duplicate concept relationship/],
    [copy => { copy.mindmaps[0].sources[0].url = 'modules.html#mod-99-s1'; }, /source lesson does not exist/]
  ];
  for (const [mutate, expected] of cases) {
    const copy = structuredClone({ modules: catalog.modules, mindmaps: catalog.mindmaps });
    mutate(copy);
    assert.throws(() => validateLearningContent(copy, { aliases: CURRICULUM_ALIASES }), expected);
  }
});

test('malformed learning identifiers return validation errors without changing saved work', async t => {
  const f = await fixture(t), user = await f.register();
  const id = randomUUID(), operationId = randomUUID();
  const fields = Object.fromEntries(DRAFT_FIELDS.map(field => [field, field === 'title' ? 'Preserved lesson' : 'Lesson content']));
  assert.equal((await f.request('/api/drafts/save', { id, version: 0, fields }, user.cookie)).status, 200);
  for (const invalid of [[operationId], { toString: operationId }, {}, null, 42]) {
    assert.equal((await f.request('/api/progress', { operationId: invalid, type: 'module', id: 'mod-1', completed: true }, user.cookie)).status, 400);
    assert.equal((await f.request('/api/quizzes/start', { operationId: invalid, mode: 'practice' }, user.cookie)).status, 400);
  }
  for (const invalid of [[id], { toString: id }, {}, null, 42]) {
    assert.equal((await f.request('/api/drafts/save', { id: invalid, version: 1, fields }, user.cookie)).status, 400);
    assert.equal((await f.request('/api/drafts/delete', { id: invalid, version: 1 }, user.cookie)).status, 400);
    assert.equal((await f.request('/api/quizzes/submit', { attemptId: invalid }, user.cookie)).status, 400);
  }
  for (const type of [['module'], { toString: 'module' }]) {
    assert.equal((await f.request('/api/progress', { operationId, type, id: 'mod-1', completed: true }, user.cookie)).status, 400);
  }
  assert.deepEqual((await f.request('/api/progress', undefined, user.cookie)).body.progress.completedModules, []);
  const draft = (await f.request('/api/drafts/detail?id=' + id, undefined, user.cookie)).body.draft;
  assert.deepEqual(draft.fields, fields);
  assert.equal(draft.version, 1);
  assert(!f.logs.some(event => event.event === 'request_failed'), 'malformed identifiers never produce internal errors');
});

test('the new map saves per account, retries safely and persists across restarts', async t => {
  const f = await fixture(t), first = await f.register(), second = await f.register();
  const event = { operationId: randomUUID(), type: 'mindmap', id: 'map-practice' };
  assert.equal((await f.request('/api/progress', event, first.cookie)).status, 200);
  assert.equal((await f.request('/api/progress', event, first.cookie)).status, 200);
  await f.stop(); await f.start();
  const saved = (await f.request('/api/progress', undefined, first.cookie)).body;
  assert.deepEqual(saved.progress.mindmapsViewed, ['map-practice']);
  assert.equal(saved.totals.mindmaps, 5);
  assert.deepEqual((await f.request('/api/progress', undefined, second.cookie)).body.progress.mindmapsViewed, []);
});
