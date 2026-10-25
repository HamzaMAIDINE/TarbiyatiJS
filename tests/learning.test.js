'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { fixture } = require('./helpers');
const { DRAFT_FIELDS } = require('../backend/learning');
const { FICHE_CYCLES } = require('../scripts/data/ficheData');
const { FICHE_TRACKS } = require('../scripts/data/fiche-tracks');

test('Moroccan stream catalogue covers general, international, technical and professional options', () => {
  assert.equal(new Set(FICHE_TRACKS.map(item => item.id)).size, FICHE_TRACKS.length, 'stream IDs are unique');
  for (const track of FICHE_TRACKS) {
    assert(track.ar && track.fr, track.id + ' has both labels');
    assert(track.levels.every(level => ['tc','bac1','bac2'].includes(level)), track.id + ' has valid years');
  }
  for (const id of ['tc-originel','tc-sciences-es','tc-lettres-sport','bac1-experimentales-fr',
    'bac2-maths-a-en','bac2-physiques','ste','arts-appliques','pro-bois','pro-construction-metallique',
    'pro-electronique','pro-energies','pro-administration','pro-agricole']) assert(FICHE_TRACKS.some(track => track.id === id), id);
});

test('fiche drafts persist all Moroccan levels and both languages with compatible validation', async t => {
  const f = await fixture(t); const user = await f.register();
  const fields = Object.fromEntries(DRAFT_FIELDS.map(field => [field, field === 'title' ? 'Bilingual lesson' : 'Lesson text']));
  const id = randomUUID(); let version = 0;
  assert.deepEqual(FICHE_CYCLES.map(cycle => cycle.levels.length), [6,3,3]);
  for (const language of ['ar','fr']) for (const cycle of FICHE_CYCLES) for (const level of cycle.levels) {
    const metadata = { language, cycle: cycle.id, level: level.id, track: cycle.id === 'lycee' ? 'Sciences physiques' : '',
      school: 'Établissement de test', teacher: 'Enseignant de test', sessionDate: '2026-10-14', duration: '60 minutes' };
    const result = await f.request('/api/drafts/save', { id, version, fields: { ...fields, ...metadata } }, user.cookie);
    assert.equal(result.status, 200, `${language}/${cycle.id}/${level.id}`);
    version = result.body.draft.version;
    for (const [key,value] of Object.entries(metadata)) assert.equal(result.body.draft.fields[key],value);
  }
  for (const invalid of [{ language: 'en' }, { cycle: 'college', level: 'p6' }, { cycle: 'unknown', level: 'p1' },
    { sessionDate: '2026-02-30' }, { sessionDate: '2026-13-01' }, { school: 'x'.repeat(201) }]) {
    assert.equal((await f.request('/api/drafts/save', { id, version, fields: { ...fields, ...invalid } }, user.cookie)).status,400);
  }
  await f.stop(); await f.start();
  const reopened = (await f.request('/api/drafts/detail?id='+id,undefined,user.cookie)).body.draft;
  assert.equal(reopened.fields.language,'fr'); assert.equal(reopened.fields.level,'bac2'); assert.equal(reopened.fields.teacher,'Enseignant de test');
});

test('custom fiches save without a template or a preselected school level', async t => {
  const f = await fixture(t); const user = await f.register();
  const fields = { ...Object.fromEntries(DRAFT_FIELDS.map(field => [field,''])), title:'My own lesson',
    language:'fr', cycle:'', level:'', track:'', school:'', teacher:'', sessionDate:'', duration:'' };
  const id = randomUUID();
  const saved = await f.request('/api/drafts/save',{id,version:0,fields},user.cookie);
  assert.equal(saved.status,200);
  assert.deepEqual(saved.body.draft.fields,fields);
  assert.deepEqual((await f.request('/api/drafts/detail?id='+id,undefined,user.cookie)).body.draft.fields,fields);
  assert.equal((await f.request('/api/drafts/save',{id,version:1,fields:{...fields,cycle:'primary'}},user.cookie)).status,200,'a cycle can be selected before a level');
  for(const invalid of [{cycle:'',level:'p1'},{cycle:'unknown',level:''},{cycle:'college',level:'p1'},{title:''}]) {
    assert.equal((await f.request('/api/drafts/save',{id,version:2,fields:{...fields,...invalid}},user.cookie)).status,400);
  }
});

test('fiche phase durations and student activities persist without breaking legacy drafts', async t => {
  const f = await fixture(t); const user = await f.register();
  const fields = Object.fromEntries(DRAFT_FIELDS.map(field => [field, field === 'title' ? 'Timed lesson' : 'Teacher text']));
  const id = randomUUID();
  const legacy = await f.request('/api/drafts/save', { id, version: 0, fields }, user.cookie);
  assert.equal(legacy.status, 200);
  const phaseFields = Object.fromEntries([1,2,3,4].flatMap(index => [
    ['student' + index, '<b>Student work ' + index + '</b>'], ['phaseDuration' + index, String(index * 5)]
  ]));
  const updated = await f.request('/api/drafts/save', { id, version: 1, fields: { ...fields, ...phaseFields, track: 'all' } }, user.cookie);
  assert.equal(updated.status, 200);
  for (const [key,value] of Object.entries(phaseFields)) assert.equal(updated.body.draft.fields[key], value);
  for (const value of ['-1', '2.5', '1441', '1e2', 'abc', '12345']) {
    assert.equal((await f.request('/api/drafts/save', { id, version: 2, fields: { ...fields, phaseDuration2: value } }, user.cookie)).status, 400, value);
  }
  assert.equal((await f.request('/api/drafts/save', { id: randomUUID(), version: 0, fields: { ...fields, phaseDuration1: '0', phaseDuration2: '', phaseDuration3: '1440' } }, user.cookie)).status, 200);
  assert.equal((await f.request('/api/drafts/save', { id, version: 2, fields: { ...fields, student1: 'x'.repeat(4001) } }, user.cookie)).status, 400);
  await f.stop(); await f.start();
  const reopened = (await f.request('/api/drafts/detail?id=' + id, undefined, user.cookie)).body.draft;
  for (const [key,value] of Object.entries(phaseFields)) assert.equal(reopened.fields[key], value);
  assert.equal(reopened.fields.track, 'all');
});

test('review intervals advance once per operation and survive restarting the server', async t => {
  let clock=Date.now(); const f=await fixture(t,{now:()=>clock}); const a=await f.register(); const b=await f.register();
  assert((await f.request('/api/reviews',undefined,a.cookie)).body.dueIds.includes('fc-1'));
  const event={type:'flashcard',id:'fc-1',known:true,operationId:randomUUID()};
  await f.request('/api/progress',event,a.cookie); await f.request('/api/progress',event,a.cookie);
  assert(!(await f.request('/api/reviews',undefined,a.cookie)).body.dueIds.includes('fc-1'));
  assert((await f.request('/api/reviews',undefined,b.cookie)).body.dueIds.includes('fc-1'));
  assert.equal((await f.request('/api/progress',{...event,known:false},a.cookie)).status,409);
  clock+=86400000; await f.stop(); await f.start();
  assert((await f.request('/api/reviews',undefined,a.cookie)).body.dueIds.includes('fc-1'));
  await f.request('/api/progress',{...event,operationId:randomUUID()},a.cookie);
  clock+=2*86400000;
  assert(!(await f.request('/api/reviews',undefined,a.cookie)).body.dueIds.includes('fc-1'));
  clock+=86400000;
  assert((await f.request('/api/reviews',undefined,a.cookie)).body.dueIds.includes('fc-1'));
  await f.request('/api/progress',{...event,known:false,operationId:randomUUID()},a.cookie);
  assert(!(await f.request('/api/reviews',undefined,a.cookie)).body.dueIds.includes('fc-1'));
  clock+=600000;
  assert((await f.request('/api/reviews',undefined,a.cookie)).body.dueIds.includes('fc-1'));
});

test('drafts preserve literal text, reject cross-account access and prevent concurrent overwrites', async t => {
  const f=await fixture(t); const a=await f.register(); const b=await f.register();
  const fields=Object.fromEntries(DRAFT_FIELDS.map(field=>[field,field==='title'?'Saved mathematics lesson':'Text for '+field]));
  fields.objectives='<img src=x onerror=alert(1)>\nSecond objective';
  const request={id:randomUUID(),version:0,fields};
  const created=await f.request('/api/drafts/save',request,a.cookie);
  assert.equal(created.status,200); assert.equal(created.body.draft.version,1); assert.equal(created.body.draft.fields.objectives,fields.objectives);
  assert.equal((await f.request('/api/drafts/save',request,a.cookie)).body.draft.version,1,'a response retry is idempotent');
  assert.equal((await f.request('/api/drafts',undefined,b.cookie)).body.drafts.length,0);
  assert.equal((await f.request('/api/drafts/detail?id='+request.id,undefined,b.cookie)).status,404);
  assert.equal((await f.request('/api/drafts/save',{...request,fields:{...fields,title:'Hijacked'}},b.cookie)).status,404);
  assert.equal((await f.request('/api/drafts/delete',{id:request.id,version:1},b.cookie)).status,404);
  const saves=await Promise.all(['First edit','Second edit'].map(title=>f.request('/api/drafts/save',{...request,version:1,fields:{...fields,title}},a.cookie)));
  assert.deepEqual(saves.map(r=>r.status).sort(),[200,409]);
  assert.equal((await f.request('/api/drafts/delete',{id:request.id,version:1},a.cookie)).status,409);
  await f.stop(); await f.start();
  const reopened=(await f.request('/api/drafts/detail?id='+request.id,undefined,a.cookie)).body.draft;
  assert.equal(reopened.version,2); assert.equal(reopened.fields.objectives,fields.objectives);
  assert.equal((await f.request('/api/drafts/save',{...request,fields:{...fields,title:''}},a.cookie)).status,400);
  assert.equal((await f.request('/api/drafts/delete',{id:request.id,version:2},a.cookie)).status,200);
  assert.equal((await f.request('/api/drafts/detail?id='+request.id,undefined,a.cookie)).status,404);
});

test('write quotas bound progress metadata and drafts per account', async t => {
  const f=await fixture(t); const a=await f.register(); const b=await f.register();
  for(let index=0;index<180;index++) assert.equal((await f.request('/api/progress',{type:'module',id:'mod-1',completed:true,operationId:randomUUID()},a.cookie)).status,200);
  assert.equal((await f.request('/api/progress',{type:'module',id:'mod-1',completed:true,operationId:randomUUID()},a.cookie)).status,429);
  const fields=Object.fromEntries(DRAFT_FIELDS.map(field=>[field,field==='title'?'Lesson':'Text']));
  for(let index=0;index<50;index++) assert.equal((await f.request('/api/drafts/save',{id:randomUUID(),version:0,fields},b.cookie)).status,200);
  assert.equal((await f.request('/api/drafts/save',{id:randomUUID(),version:0,fields},b.cookie)).status,409);
});
