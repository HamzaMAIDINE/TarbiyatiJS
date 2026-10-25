'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { GLOSSARY_DATA } = require('../scripts/data/glossaryData');
const { modules } = require('../backend/catalog');

test('expanded bilingual glossary has unique terms, complete examples and valid lesson references', () => {
  const normalized = value => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim();
  const moduleIds = new Set(modules.map(module => module.id));
  assert(GLOSSARY_DATA.length >= 100);
  assert.equal(new Set(GLOSSARY_DATA.map(item => normalized(item.termAr))).size, GLOSSARY_DATA.length);
  assert.equal(new Set(GLOSSARY_DATA.map(item => normalized(item.termFr))).size, GLOSSARY_DATA.length);
  assert(new Set(GLOSSARY_DATA.map(item => item.category)).size >= 9);
  assert.deepEqual([...new Set(GLOSSARY_DATA.map(item => item.moduleId))].sort(), [...moduleIds].sort());
  for (const item of GLOSSARY_DATA) {
    for (const field of ['termAr','termFr','def','example','category']) assert.equal(typeof item[field], 'string', item.termAr + ': ' + field);
    assert(/[\u0600-\u06ff]/.test(item.termAr) && /[a-z]/i.test(item.termFr));
    assert(item.def.trim() && item.example.trim() && item.category.trim());
    assert(Array.isArray(item.tags) && item.tags.length && item.tags.every(tag => typeof tag === 'string' && tag.trim()));
    assert(moduleIds.has(item.moduleId), 'Unknown source module for ' + item.termAr);
    assert(!JSON.stringify(item).includes('\uFFFD'), 'Invalid text encoding for ' + item.termAr);
  }
});
