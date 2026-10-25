'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp } = require('../server');
function verificationCode(message) {
  const match = message?.text.match(/^([0-9]{6})$/m);
  assert(match, 'Verification email must contain a six-digit code.');
  return match[1];
}
async function fixture(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tarbiyati-test-'));
  const messages = []; const logs = [];
  let app, origin;
  async function start() {
    app = createApp({ databasePath: path.join(directory,'test.sqlite'), production: false, publicOrigin: '',
      deliverMail: message => messages.push(message), smtp: null, brevo: null, logger: event => logs.push(event), backupIntervalHours: 0, ...options });
    app.server.listen(0,'127.0.0.1'); await once(app.server,'listening'); origin = `http://127.0.0.1:${app.server.address().port}`;
  }
  async function stop() { await new Promise(resolve => app.server.close(resolve)); await app.closed(); }
  async function request(route, body, cookie, headers = {}, method) {
    const response = await fetch(origin + route, { method: method || (body === undefined ? 'GET' : 'POST'), redirect: 'manual',
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'X-ScienceEdu-Request': '1', Origin: options.publicOrigin || origin }), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await response.text();
    return { status: response.status, body: response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : text,
      cookie: response.headers.get('set-cookie')?.split(';')[0], headers: response.headers };
  }
  let counter = 0;
  async function register(email, { verify = true } = {}) {
    const address = email || `learner-${++counter}@example.test`;
    const result = await request('/api/auth/register',{name:'Test learner',email:address,password:'Test-learner-password'});
    if (verify && result.status === 201) {
      await app.flushMail();
      const message = messages.findLast(item=>item.to===address&&/^([0-9]{6})$/m.test(item.text));
      assert(message,'Fixture verification mail was not delivered.');
      assert.equal((await request('/api/auth/verify-email',{code:verificationCode(message)},result.cookie)).status,200);
      result.body = (await request('/api/session',undefined,result.cookie)).body;
    }
    return result;
  }
  await start();
  t.after(async () => {
    if (app.server.listening) await stop();
    assert(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(directory).startsWith('tarbiyati-test-'));
    await fs.promises.rm(directory,{recursive:true,force:true,maxRetries:20,retryDelay:100});
  });
  return { directory, messages, logs, request, register, stop, start, get app() { return app; }, get origin() { return origin; } };
}
module.exports = { fixture, verificationCode };
