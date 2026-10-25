'use strict';
require('./runtime');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

function transaction(db, work) {
  if (db.isTransaction) return work(); // The outer synchronous operation owns commit/rollback.
  db.exec('BEGIN IMMEDIATE');
  try { const result = work(); db.exec('COMMIT'); return result; }
  catch (error) { if (db.isTransaction) db.exec('ROLLBACK'); throw error; }
}

function openDatabase(filename, now = Date.now) {
  if (filename !== ':memory:') {
    fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
    // Create sensitive files privately before SQLite also creates its WAL/SHM sidecars.
    fs.closeSync(fs.openSync(filename, 'a', 0o600));
  }
  const db = new DatabaseSync(filename);
  try {
    initializeDatabase(db, now);
    return db;
  } catch (error) { db.close(); throw error; }
}

function initializeDatabase(db, now) {
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version > 4) throw new Error('Database was created by a newer application version.');
  if (version < 1) transaction(db, () => db.exec(`
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS session_expiry ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS progress (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS progress_events (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      operation_id TEXT NOT NULL, PRIMARY KEY(user_id, operation_id));
    PRAGMA user_version=1;
  `));
  if (version < 2) transaction(db, () => {
    db.exec(`
      ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE sessions ADD COLUMN id TEXT NOT NULL DEFAULT '';
      ALTER TABLE sessions ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE sessions ADD COLUMN user_agent TEXT NOT NULL DEFAULT '';
      UPDATE sessions SET id=lower(hex(randomblob(16))) WHERE id='';
      CREATE UNIQUE INDEX session_id ON sessions(id);
      CREATE INDEX session_user ON sessions(user_id);
      ALTER TABLE progress_events ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE progress_events ADD COLUMN payload_hash TEXT NOT NULL DEFAULT '';
      CREATE INDEX event_age ON progress_events(created_at);
      CREATE TABLE account_tokens (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        purpose TEXT NOT NULL CHECK(purpose IN ('verify','reset')), expires_at INTEGER NOT NULL);
      CREATE TABLE mail_jobs (id TEXT PRIMARY KEY, recipient TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL,
        created_at INTEGER NOT NULL, next_attempt INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed')));
      CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, until INTEGER NOT NULL);
      CREATE TABLE quiz_attempts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        mode TEXT NOT NULL CHECK(mode IN ('practice','exam')), config TEXT NOT NULL, questions TEXT NOT NULL,
        answers TEXT NOT NULL DEFAULT '{}', position INTEGER NOT NULL DEFAULT 0, pool_size INTEGER NOT NULL,
        created_at INTEGER NOT NULL, deadline INTEGER, finished_at INTEGER,
        status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','submitted','abandoned')), score INTEGER);
      CREATE INDEX quiz_user ON quiz_attempts(user_id, created_at DESC);
      CREATE TABLE card_reviews (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, card_id TEXT NOT NULL,
        repetitions INTEGER NOT NULL DEFAULT 0, interval_days INTEGER NOT NULL DEFAULT 0, due_at INTEGER NOT NULL,
        PRIMARY KEY(user_id,card_id));
      CREATE INDEX review_due ON card_reviews(user_id,due_at);
      CREATE TABLE lesson_drafts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL, fields TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL);
      CREATE INDEX draft_user ON lesson_drafts(user_id,updated_at DESC);
      PRAGMA user_version=2;
    `);
    db.prepare('UPDATE progress_events SET created_at=? WHERE created_at=0').run(now());
    db.prepare('UPDATE sessions SET created_at=? WHERE created_at=0').run(now());
  });
  if (version < 3) transaction(db, () => db.exec(`
    ALTER TABLE mail_jobs ADD COLUMN token_hash TEXT;
    PRAGMA user_version=3;
  `));
  if (version < 4) transaction(db, () => db.exec(`
    CREATE TABLE quiz_attempts_v4 (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mode TEXT NOT NULL CHECK(mode IN ('practice','exam')), config TEXT NOT NULL, questions TEXT NOT NULL,
      answers TEXT NOT NULL DEFAULT '{}', position INTEGER NOT NULL DEFAULT 0, pool_size INTEGER NOT NULL,
      created_at INTEGER NOT NULL, deadline INTEGER, finished_at INTEGER,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','submitted','abandoned')), score INTEGER,
      remaining_ms INTEGER CHECK(remaining_ms IS NULL OR remaining_ms >= 0), paused_at INTEGER,
      state_version INTEGER NOT NULL DEFAULT 0);
    INSERT INTO quiz_attempts_v4 (id,user_id,mode,config,questions,answers,position,pool_size,created_at,deadline,finished_at,status,score)
      SELECT id,user_id,mode,config,questions,answers,position,pool_size,created_at,deadline,finished_at,status,score FROM quiz_attempts;
    DROP TABLE quiz_attempts;
    ALTER TABLE quiz_attempts_v4 RENAME TO quiz_attempts;
    CREATE INDEX quiz_user ON quiz_attempts(user_id, created_at DESC);
    PRAGMA user_version=4;
  `));
  db.exec(`CREATE INDEX IF NOT EXISTS mail_pending ON mail_jobs(status,next_attempt,created_at);
    CREATE INDEX IF NOT EXISTS mail_proof ON mail_jobs(token_hash);
    CREATE INDEX IF NOT EXISTS account_token_user ON account_tokens(user_id,purpose);
    CREATE INDEX IF NOT EXISTS rate_limit_expiry ON rate_limits(until);`);
}

function maintainDatabase(db, now = Date.now()) {
  transaction(db, () => {
    db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now);
    db.prepare('DELETE FROM account_tokens WHERE expires_at<=?').run(now);
    db.prepare('DELETE FROM rate_limits WHERE until<=?').run(now);
    db.prepare('DELETE FROM progress_events WHERE created_at<?').run(now - 30 * 86400000);
    db.prepare("DELETE FROM mail_jobs WHERE status!='pending' AND created_at<?").run(now - 7 * 86400000);
    db.prepare("DELETE FROM quiz_attempts WHERE status='abandoned' AND created_at<?").run(now - 86400000);
    db.prepare("DELETE FROM quiz_attempts WHERE mode='practice' AND status='active' AND created_at<?").run(now - 7 * 86400000);
    db.exec(`DELETE FROM quiz_attempts WHERE id IN (SELECT id FROM
      (SELECT id, ROW_NUMBER() OVER(PARTITION BY user_id ORDER BY created_at DESC) AS position
      FROM quiz_attempts WHERE status='submitted') WHERE position>200)`);
  });
}
module.exports = { openDatabase, transaction, maintainDatabase };
