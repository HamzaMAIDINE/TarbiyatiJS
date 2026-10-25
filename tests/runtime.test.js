'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { isPatchedRuntime, assertPatchedRuntime } = require('../backend/runtime');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
test('startup rejects vulnerable, unsupported and prerelease Node runtimes', () => {
  for (const version of ['18.20.8','20.19.0','22.14.0','22.23.3','23.11.0','24.22.0','25.9.0','26.12.0','26.12.1-rc.1','invalid']) {
    assert.equal(isPatchedRuntime(version), false, version);
    assert.throws(() => assertPatchedRuntime(version), /unpatched Node/);
  }
  for (const version of ['22.23.4','22.24.0','24.22.1','24.23.0','26.12.1','26.13.0']) assert.doesNotThrow(() => assertPatchedRuntime(version));
});

test('a misspelled production mode cannot start the server in development mode', () => {
  const result = spawnSync(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'), env: { ...process.env, NODE_ENV: 'prod' },
    encoding: 'utf8', timeout: 10000, windowsHide: true
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /NODE_ENV must be production, development or test/);
});
