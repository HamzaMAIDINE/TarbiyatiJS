'use strict';

// npm's engines field normally only warns. Reject vulnerable runtimes before
// loading a server, SQLite backup or mail transport as well.
function isPatchedRuntime(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return false;
  const [major, minor, patch] = match.slice(1).map(Number);
  const atLeast = (minimumMinor, minimumPatch) => minor > minimumMinor || minor === minimumMinor && patch >= minimumPatch;
  return major === 22 && atLeast(23, 4) || major === 24 && atLeast(22, 1) || major === 26 && atLeast(12, 1) || major > 26;
}
function assertPatchedRuntime(version = process.versions.node) {
  if (!isPatchedRuntime(version)) throw new Error('Unsupported or unpatched Node.js runtime. Use Node 22.23.4+, 24.22.1+, or 26.12.1+; see .nvmrc.');
}
assertPatchedRuntime();
module.exports = { isPatchedRuntime, assertPatchedRuntime };
