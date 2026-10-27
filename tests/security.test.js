'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { fixture } = require('./helpers');
const { clientIp } = require('../backend/security');
const { validateSvg } = require('../backend/asset-security');
const { DRAFT_FIELDS } = require('../backend/learning');

test('trusted proxy chains cannot be spoofed from an untrusted peer', () => {
  const req = (peer, forwarded) => ({socket:{remoteAddress:peer},headers:{'x-forwarded-for':forwarded}});
  assert.equal(clientIp(req('203.0.113.4','198.51.100.5'),new Set(['127.0.0.1'])),'203.0.113.4');
  assert.equal(clientIp(req('::ffff:127.0.0.1','198.51.100.99, 203.0.113.4'),new Set(['127.0.0.1'])),'203.0.113.4');
  assert.equal(clientIp(req('127.0.0.1','198.51.100.5, 10.0.0.1'),new Set(['127.0.0.1','10.0.0.1'])),'198.51.100.5');
  assert.equal(clientIp(req('127.0.0.1','invalid'),new Set(['127.0.0.1'])),'127.0.0.1');
});

test('malformed authentication and one throttled account do not lock out other learners', async t => {
  const f = await fixture(t,{trustedProxies:['127.0.0.1']});
  for (let index=0;index<35;index++) assert.equal((await f.request('/api/auth/login',{},null,{'X-Forwarded-For':`198.51.100.${index+1}`})).status,400);
  const a = await f.register('target@example.test'); const b = await f.register('other@example.test');
  assert.equal(a.status,201); assert.equal(b.status,201);
  for (let index=0;index<10;index++) assert.equal((await f.request('/api/auth/login',{email:a.body.user.email,password:'wrong'},null,{'X-Forwarded-For':`203.0.113.${index+1}`})).status,401);
  await f.stop(); await f.start();
  const blocked = await f.request('/api/auth/login',{email:a.body.user.email,password:'wrong'});
  assert.equal(blocked.status,429); assert(Number(blocked.headers.get('retry-after'))>0);
  assert.equal((await f.request('/api/auth/login',{email:b.body.user.email,password:'Test-learner-password'})).status,200);
});

test('CSP, request validation, account changes and private files are enforced', async t => {
  const f = await fixture(t); const a = await f.register(); const b = await f.register();
  const event = {type:'module',id:'mod-1',completed:true,operationId:randomUUID()};
  assert.equal((await f.request('/api/progress',event,a.cookie,{Origin:'https://evil.example'})).status,403);
  assert.equal((await f.request('/api/progress',event,a.cookie,{'X-ScienceEdu-Request':''})).status,403);
  assert.equal((await f.request('/api/progress',event,b.cookie,{'X-ScienceEdu-User':a.body.user.id})).body.code,'ACCOUNT_CHANGED');
  for (const type of ['__proto__','constructor']) assert.equal((await f.request('/api/progress',{...event,type},a.cookie)).status,400);
  assert.equal((await f.request('/api/progress',{...event,extra:'x'.repeat(40000)},a.cookie)).status,413);
  assert.equal((await f.request('/api/progress',event,a.cookie,{'Content-Type':'application/json-invalid'})).status,415);
  assert.equal((await f.request('/%ZZ')).status,400);
  for (const route of ['/scripts/data/quizData.js','/scripts/data/quizdata.js','/scripts/DATA/QUIZDATA.JS','/scripts/data//quizData.js','/scripts/data%2fquizData.js','/.env','/server.js','/backend/auth.js','/.data/test.sqlite']) assert.equal((await f.request(route)).status,404,route);
  const landing = await f.request('/');
  assert.match(landing.headers.get('content-security-policy'),/script-src 'self'; script-src-attr 'none'/);
  assert(!landing.headers.get('content-security-policy').includes("script-src 'self' 'unsafe-inline'"));
  const css = await f.request('/styles/main.css'); assert.match(css.headers.get('cache-control'),/public/);
  assert.equal((await f.request('/styles/main.css',undefined,null,{'If-None-Match':css.headers.get('etag')})).status,304);
  assert.equal((await f.request('/api/health')).body.status,'ok');
  const logs = JSON.stringify(f.logs); assert(!logs.includes(a.body.user.email)); assert(!logs.includes(a.cookie));
});

test('all page scripts and controls can run under the enforced script policy', () => {
  const root = path.join(__dirname,'..');
  for (const filename of ['index.html',...fs.readdirSync(path.join(root,'pages')).map(name=>'pages/'+name)]) {
    const source = fs.readFileSync(path.join(root,filename),'utf8');
    assert(!/\bon(?:click|input|change|keydown)\s*=/.test(source),filename);
    for (const script of source.matchAll(/<script\b([^>]*)>/g)) {
      const src = script[1].match(/src="([^"]+)"/); assert(src,`Inline script in ${filename}`);
      const url = new URL(src[1], 'https://tarbiyati.invalid/' + filename);
      assert.equal(url.origin, 'https://tarbiyati.invalid', `External script in ${filename}`);
      assert(fs.existsSync(path.resolve(root, '.' + decodeURIComponent(url.pathname))),`Missing script in ${filename}: ${src[1]}`);
    }
  }
});

test('malformed raw request targets return 400 and the server remains available', async t => {
  const f = await fixture(t);
  for (const target of ['http://[', '//[', '/bad\\path']) {
    const status = await new Promise((resolve, reject) => {
      const request = require('node:http').request(f.origin, { path: target }, response => {
        response.resume(); response.on('end', () => resolve(response.statusCode));
      });
      request.on('error', reject); request.end();
    });
    assert.equal(status, 400, target);
    assert.equal((await f.request('/api/health')).status, 200);
  }
});

test('JSON rejects prototype keys, excessive nesting, compressed bodies and invalid UTF-8', async t => {
  const f = await fixture(t);
  for (const payload of ['{"__proto__":{"admin":true}}', '{"nested":{"constructor":{"prototype":{"admin":true}}}}', '{"a":'.repeat(22) + '1' + '}'.repeat(22), Buffer.from([0x7b,0x22,0x78,0x22,0x3a,0x22,0xff,0x22,0x7d])]) {
    const response = await fetch(f.origin + '/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json','X-ScienceEdu-Request':'1'}, body:payload });
    assert.equal(response.status, 400); await response.text();
  }
  assert.equal((await f.request('/api/auth/login', {}, null, {'Content-Encoding':'gzip'})).status, 415);
  assert.equal({}.admin, undefined);
});

test('SQL and markup payloads stay literal and cannot access another account', async t => {
  const f = await fixture(t, {adminEmails:['admin@example.test']});
  const admin = await f.register('admin@example.test'); const learner = await f.register();
  const payload = `'; DROP TABLE users; -- <svg onload="alert(1)"></svg>`;
  const id = randomUUID(), fields = Object.fromEntries(DRAFT_FIELDS.map(key => [key,payload]));
  const saved = await f.request('/api/drafts/save', {id,version:0,fields}, learner.cookie);
  assert.equal(saved.status,200); assert.equal(saved.body.draft.fields.title,payload);
  assert.equal((await f.request('/api/drafts/detail?id='+id,undefined,admin.cookie)).status,404);
  assert.equal((await f.request('/api/drafts/delete',{id,version:1},admin.cookie)).status,404);
  assert.equal((await f.request('/api/admin/users?search='+encodeURIComponent("' OR 1=1 --"),undefined,admin.cookie)).body.pagination.total,0);
  assert.equal((await f.request('/api/auth/login',{email:"' OR 1=1 --@example.test",password:'wrong'})).status,400);
  assert.equal((await f.request('/api/auth/login',{email:"'or'1'='1@example.test",password:'wrong'})).status,401);
  assert.equal((await f.request('/api/admin/overview',undefined,admin.cookie)).body.stats.totalUsers,2);
  assert.equal((await f.request('/api/drafts/detail?id='+id,undefined,learner.cookie)).body.draft.fields.title,payload);
  assert.equal((await f.request('/api/drafts/save',{id,version:Number.MAX_SAFE_INTEGER,fields},learner.cookie)).status,400);
});

test('SVG artwork has passive response policy and unsafe modifications fail validation', async t => {
  const f = await fixture(t);
  const svg = await f.request('/assets/favicon.svg');
  assert.equal(svg.status,200);
  assert.match(svg.headers.get('content-security-policy'),/default-src 'none'.*sandbox/);
  assert.equal(svg.headers.get('cross-origin-resource-policy'),'same-origin');
  for (const fragment of ['<script href="/scripts/app.js"/>','<foreignObject/>','<animate attributeName="href"/>','<path onload="alert(1)"/>','<use href="jav&#x61;script:alert(1)"/>','<image href="https://evil.example/track"/>','<style>@import "https://evil.example";</style>','<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]>','<path style="fill:url(https://evil.example/track)"/>']) {
    assert.throws(()=>validateSvg('<svg>'+fragment+'</svg>'),/Unsafe SVG/);
  }
  validateSvg('<svg><defs><linearGradient id="paint"/></defs><path fill="url(#paint)"/></svg>');
});

test('signup throttling persists and session creation keeps only ten devices', async t => {
  const f = await fixture(t); const account = await f.register();
  for (let index=0;index<11;index++) assert.equal((await f.request('/api/auth/login',{email:account.body.user.email,password:'Test-learner-password'})).status,200);
  assert.equal((await f.request('/api/session',undefined,account.cookie)).body.user,null);
  const last = await f.request('/api/auth/login',{email:account.body.user.email,password:'Test-learner-password'});
  assert.equal((await f.request('/api/auth/sessions',undefined,last.cookie)).body.sessions.length,10);
  for (let index=0;index<9;index++) assert.equal((await f.request('/api/auth/register',{})).status,400);
  await f.stop(); await f.start();
  const blocked = await f.request('/api/auth/register',{});
  assert.equal(blocked.status,429); assert(Number(blocked.headers.get('retry-after'))>0);
});

test('HTTPS development origins also issue and clear Secure session cookies', async t => {
  const f = await fixture(t, {publicOrigin:'https://learn.example.test'});
  const account = await f.register();
  assert.match(account.headers.get('set-cookie'), /; Secure(?:;|$)/);
  assert.match((await f.request('/api/auth/logout',{},account.cookie)).headers.get('set-cookie'), /; Secure(?:;|$)/);
});

test('PDFs outside the explicitly public reference directory are private', async t => {
  const f = await fixture(t);
  const name = `.security-test-${randomUUID()}.pdf`;
  const filename = path.join(__dirname,'..',name);
  fs.writeFileSync(filename,'%PDF-private-test',{flag:'wx',mode:0o600});
  t.after(()=>fs.unlinkSync(filename));
  assert.equal((await f.request('/'+name)).status,404);
});
