'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { MINDMAPS_DATA } = require('../scripts/data/mindmapsData');

test('mind maps retain progress identities and provide complete source-linked study content', () => {
  assert.deepEqual(MINDMAPS_DATA.map(map => map.id), ['map-theories', 'map-effects', 'map-reforms', 'map-eval-comm', 'map-practice']);
  const branches = MINDMAPS_DATA.flatMap(map => map.root.branches);
  assert.equal(branches.length, 40);
  assert.equal(new Set(branches.map(branch => branch.id)).size, branches.length);
  for (const map of MINDMAPS_DATA) {
    assert(map.title && map.memory && map.root.name && map.root.prompt);
    assert(map.sources.length > 0);
    for (const source of map.sources) {
      assert(source.label);
      if (source.url.startsWith('https://')) continue;
      const url = new URL(source.url, 'https://local.test/pages/mindmaps.html');
      assert(fs.existsSync(path.join(__dirname, '..', decodeURIComponent(url.pathname))), `Missing source: ${source.url}`);
    }
  }
  for (const branch of branches) {
    for (const field of ['title', 'keyword', 'tagline', 'summary', 'memory', 'confusion', 'tone']) assert(branch[field], `${branch.id}: ${field}`);
    assert(branch.details.length >= 3);
    assert(branch.details.every(detail => detail.label && detail.text));
    assert(branch.example.situation && branch.example.reading && branch.example.action);
    assert(branch.recall.question && branch.recall.answer);
    assert.match(branch.moduleId, /^mod-[1-8]$/);
    assert.match(branch.sectionId, new RegExp('^' + branch.moduleId + '-s\\d+$'));
    assert(!JSON.stringify(branch).includes('\uFFFD'), `Invalid text encoding: ${branch.id}`);
  }
  assert.equal(MINDMAPS_DATA.find(map => map.id === 'map-effects').root.branches.length, 12);
  assert.deepEqual(MINDMAPS_DATA.find(map => map.id === 'map-reforms').root.branches.map(branch => branch.year), ['1999', '2002', '2009–2012', '2015–2030', '2019', '2022–2026']);
});
