'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { fixture } = require('./helpers');
const root = path.join(__dirname, '..');
const mobileSync = path.resolve(root, '../Mobile/tool/sync-content.cjs');
const resources = vm.runInNewContext(fs.readFileSync(path.join(root, 'scripts/data/resourcesData.js'), 'utf8') + '\nRESOURCES_DATA');

test('the complete mobile content bundle matches the current website sources', { skip: !fs.existsSync(mobileSync) && 'Mobile sibling is absent in a standalone Node deployment.' }, () => {
  const result = spawnSync(process.execPath, [mobileSync, '--check'], { encoding: 'utf8', windowsHide: true });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('resource identifiers, categories, tables and embedded local PDF links are consistent', () => {
  const categories = new Set(resources.categories.map(category => category.id));
  const ids = new Set();
  let pdfLinks = 0;
  for (const resource of resources.items) {
    assert(resource.id && !ids.has(resource.id), 'duplicate resource: ' + resource.id);
    ids.add(resource.id);
    assert(categories.has(resource.category), resource.id + ': unknown category');
    if (resource.matrixData) {
      assert(resource.matrixData.rows.every(row => row.length === resource.matrixData.headers.length), resource.id + ': incomplete table');
    }
    for (const html of [...(resource.keyPoints || []), resource.content || '']) {
      for (const [, href] of html.matchAll(/href=["']([^"']+)["']/g)) {
        const url = new URL(href, 'https://learning.invalid/');
        if (url.origin !== 'https://learning.invalid') continue;
        const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
        assert(file.startsWith(root + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile(), resource.id + ': missing local resource');
        if (url.pathname.endsWith('.pdf')) pdfLinks++;
      }
    }
  }
  assert(pdfLinks > 0, 'the PDF resource has a usable download link');
});

test('the added PDF is served with range support and cited by the shared lessons', async t => {
  const resource = resources.items.find(item => item.id === 'res-15');
  const href = resource.keyPoints.join('\n').match(/href=["']([^"']+\.pdf)["']/)?.[1];
  assert(href, 'the added PDF has a download link');
  const catalog = require('../backend/catalog');
  const citations = catalog.modules.flatMap(module => module.sections.flatMap(section => section.sources)).filter(source => source.document === 'kotbane');
  assert(citations.length > 0, 'the new reference is integrated into lessons');
  assert(citations.every(source => source.url.split('#')[0] === href), 'lesson citations and resource download point to the same PDF');
  const f = await fixture(t);
  const result = await f.request(href, undefined, undefined, { Range: 'bytes=0-4' });
  assert.equal(result.status, 206);
  assert.equal(result.headers.get('content-type'), 'application/pdf');
  assert.equal(result.body, '%PDF-');
});
