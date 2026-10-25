'use strict';
require('./runtime');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

function verifyBackup(filename) {
  const db = new DatabaseSync(filename, { readOnly: true });
  try {
    if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' || db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Backup integrity check failed.');
    if (!db.prepare("SELECT name FROM sqlite_master WHERE name='users'").get()) throw new Error('Not a Tarbiyati backup.');
    return { valid: true, schemaVersion: db.prepare('PRAGMA user_version').get().user_version };
  } finally { db.close(); }
}
function backupDatabase(db, directory, time = Date.now()) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const filename = path.join(directory, `scienceedu-${new Date(time).toISOString().replace(/[:.]/g, '-')}-${require('node:crypto').randomBytes(3).toString('hex')}.sqlite`);
  fs.closeSync(fs.openSync(filename, 'wx', 0o600));
  try {
    db.prepare('VACUUM INTO ?').run(filename);
    verifyBackup(filename);
  } catch (error) {
    // Only this newly reserved snapshot is removed; existing verified backups stay intact.
    try { fs.unlinkSync(filename); } catch { /* Preserve the original backup failure. */ }
    throw error;
  }
  const files = fs.readdirSync(directory).filter(name => /^scienceedu-[\dTZ-]+-[a-f0-9]{6}\.sqlite$/.test(name)).sort().reverse();
  for (const name of files.slice(7)) fs.unlinkSync(path.join(directory, name));
  return filename;
}
module.exports = { verifyBackup, backupDatabase };
