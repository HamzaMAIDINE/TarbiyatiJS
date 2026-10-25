'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseEnv } = require('node:util');
const { validateSvg } = require('../backend/asset-security');

const root = path.join(__dirname, '..');
const sources = ['server.js', 'index.html', 'backend', 'scripts', 'styles', 'pages', 'tools', 'tests', 'content', 'assets'];
const files = [];
function collect(relative) {
  const absolute = path.join(root, relative);
  if (relative.endsWith('.svg')) {
    try { validateSvg(fs.readFileSync(absolute, 'utf8'), relative); }
    catch (error) { fail(error.message); }
  }
  if (fs.statSync(absolute).isDirectory()) {
    for (const name of fs.readdirSync(absolute)) collect(path.join(relative, name));
  } else files.push(relative);
}
sources.forEach(collect);
const mobileImages = path.resolve(root, '../Mobile/assets/images');
if (fs.existsSync(mobileImages)) collect('../Mobile/assets/images');
let failures = 0, references = 0;
function fail(message) { failures++; console.error(message); }
let publicPaths = new Set();
try {
  const catalog = require('../backend/catalog');
  publicPaths = new Set(require('../backend/seo').createPublicSite({ catalog }).publicPaths);
} catch (error) { fail(error.message); }
for (const relative of files) {
  const absolute = path.join(root, relative);
  if (relative.endsWith('.js')) {
    const result = spawnSync(process.execPath, ['--check', absolute], { encoding: 'utf8', windowsHide: true });
    if (result.error || result.status !== 0) fail(`Invalid JavaScript: ${relative}\n${result.stderr || result.error?.message || 'Syntax check failed.'}`);
  }
  if (relative.endsWith('.json')) {
    try { JSON.parse(fs.readFileSync(absolute, 'utf8')); }
    catch { fail(`Invalid JSON: ${relative}`); }
  }
  if (!/\.(?:html|css)$/.test(relative)) continue;
  const source = fs.readFileSync(absolute, 'utf8');
  const matches = relative.endsWith('.html') ? source.matchAll(/\b(?:src|href)=["']([^"']+)["']/g) : source.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g);
  for (const [, reference] of matches) {
    if (reference.startsWith('#') || /^(?:[a-z]+:|\/\/)/i.test(reference)) continue;
    const url = new URL(reference, 'https://tarbiyati.invalid/' + relative.split(path.sep).join('/'));
    const target = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    references++;
    if (publicPaths.has(url.pathname)) continue;
    if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) fail(`Missing local reference in ${relative}: ${reference}`);
  }
}
const template = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
const values = parseEnv(template);
for (const key of ['SMTP_USER', 'SMTP_KEY', 'SMTP_PASS', 'SMTP_FROM', 'BREVO_API_KEY', 'ADMIN_EMAIL', 'ADMIN_EMAILS', 'EMAIL_WEBHOOK_TOKEN']) {
  if (values[key]) fail(`The public .env.example must leave ${key} blank.`);
}
// Report only filenames; never echo a credential into CI logs.
for (const relative of [...files.filter(name => /\.(?:js|json|html|md|txt)$/.test(name)), '.env.example', 'README.md']) {
  if (/(?:xsmtpsib-|xkeysib-)[A-Za-z0-9-]{20,}|(?:sk-proj-|ghp_)[A-Za-z0-9_-]{20,}|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/.test(fs.readFileSync(path.join(root, relative), 'utf8'))) fail(`Possible credential in public source: ${relative}`);
}
try {
  const catalog = require('../backend/catalog');
  const counts = require('../backend/validate-learning-content').validateLearningContent(catalog, { aliases: require('../scripts/data/curriculumData').CURRICULUM_ALIASES });
  console.log(`Learning content checked: ${counts.sections} lessons, ${counts.workshops} workshops, ${counts.mindmaps} maps, ${counts.branches} branches.`);
} catch (error) { fail(error.message); }
const mobileSync = path.resolve(root, '../Mobile/tool/sync-content.cjs');
if (fs.existsSync(mobileSync)) {
  const mobileContent = spawnSync(process.execPath, [mobileSync, '--check'], { encoding: 'utf8', windowsHide: true });
  if (mobileContent.error || mobileContent.status !== 0) fail(mobileContent.stderr || mobileContent.error?.message || 'Mobile content check failed.');
  else console.log(mobileContent.stdout.trim());
}
console.log(`${files.length} source/assets checked; ${references} local page/style references checked; ${failures} failures.`);
process.exitCode = failures ? 1 : 0;
