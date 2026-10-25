'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
const { openDatabase } = require('../backend/database');
const { backupDatabase, verifyBackup } = require('../backend/operations');
const { fixture } = require('./helpers');
const { spawnSync } = require('node:child_process');

test('original databases migrate twice safely without losing accounts or progress', t => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'tarbiyati-test-')); const filename=path.join(directory,'legacy.sqlite');
  t.after(()=>{assert(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(directory,{recursive:true,force:true});});
  const old=new DatabaseSync(filename);
  old.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,password_salt TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL);
    CREATE TABLE progress(user_id TEXT PRIMARY KEY REFERENCES users(id),data TEXT NOT NULL);
    CREATE TABLE progress_events(user_id TEXT NOT NULL REFERENCES users(id),operation_id TEXT NOT NULL,PRIMARY KEY(user_id,operation_id));`);
  old.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run('legacy','Legacy learner','legacy@example.test','hash','salt','2026-01-01');
  old.prepare('INSERT INTO progress VALUES(?,?)').run('legacy',JSON.stringify({completedModules:['mod-1'],quizzesTaken:2,quizScore:75}));
  old.prepare('INSERT INTO sessions VALUES(?,?,?)').run('hashed-session','legacy',Date.now()+86400000);
  old.close();
  for(let i=0;i<2;i++) {
    const db=openDatabase(filename);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version,4);
    assert.equal(db.prepare('SELECT email FROM users').get().email,'legacy@example.test');
    assert.equal(JSON.parse(db.prepare('SELECT data FROM progress').get().data).quizScore,75);
    assert(db.prepare('SELECT id FROM sessions').get().id); db.close();
  }
});

test('live WAL backups pass integrity checks and restore account progress', async t => {
  const f=await fixture(t); const user=await f.register();
  await f.request('/api/progress',{type:'module',id:'mod-3',completed:true,operationId:randomUUID()},user.cookie);
  const backup=f.app.backup(); assert.equal(verifyBackup(backup).valid,true);
  const restored=path.join(f.directory,'restored.sqlite'); fs.copyFileSync(backup,restored,fs.constants.COPYFILE_EXCL);
  const db=openDatabase(restored);
  assert.equal(db.prepare('SELECT email FROM users').get().email,user.body.user.email);
  assert.deepEqual(JSON.parse(db.prepare('SELECT data FROM progress').get().data).completedModules,['mod-3']); db.close();
});

test('failed backup creation removes its incomplete file and preserves existing snapshots', async t => {
  const f = await fixture(t);
  await f.register();
  const previous = f.app.backup(), original = fs.readFileSync(previous);
  const directory = path.dirname(previous), names = fs.readdirSync(directory);
  const failing = { prepare: () => ({ run: () => { throw new Error('Simulated disk write failure'); } }) };
  assert.throws(() => backupDatabase(failing, directory), /Simulated disk write failure/);
  assert.deepEqual(fs.readdirSync(directory), names);
  assert.deepEqual(fs.readFileSync(previous), original);
  assert.equal(verifyBackup(previous).valid, true);
});

test('version 3 quiz attempts migrate without changing saved answers, deadlines or results', t => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'tarbiyati-test-')); const filename=path.join(directory,'v3.sqlite');
  t.after(()=>{assert(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(directory,{recursive:true,force:true});});
  const legacy=new DatabaseSync(filename);
  legacy.exec(`CREATE TABLE users(id TEXT PRIMARY KEY);
    INSERT INTO users VALUES('learner');
    CREATE TABLE quiz_attempts(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mode TEXT NOT NULL CHECK(mode IN ('practice','exam')),config TEXT NOT NULL,questions TEXT NOT NULL,
      answers TEXT NOT NULL DEFAULT '{}',position INTEGER NOT NULL DEFAULT 0,pool_size INTEGER NOT NULL,
      created_at INTEGER NOT NULL,deadline INTEGER,finished_at INTEGER,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','submitted','abandoned')),score INTEGER);
    CREATE INDEX quiz_user ON quiz_attempts(user_id,created_at DESC);
    CREATE TABLE mail_jobs(status TEXT,next_attempt INTEGER,created_at INTEGER,token_hash TEXT);
    CREATE TABLE account_tokens(user_id TEXT,purpose TEXT);
    CREATE TABLE rate_limits(until INTEGER);
    PRAGMA user_version=3;`);
  for(const [index,status] of ['active','submitted','abandoned'].entries()) {
    legacy.prepare('INSERT INTO quiz_attempts VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run('attempt-'+index,'learner','exam','{"examId":"exam-2023"}','[{"id":2023061}]','{"2023061":2}',39,60,1000,7201000,status==='submitted'?3000:null,status,status==='submitted'?1:null);
  }
  const before=legacy.prepare('SELECT * FROM quiz_attempts ORDER BY id').all().map(row=>({...row})); legacy.close();
  for(let pass=0;pass<2;pass++) {
    const db=openDatabase(filename);
    const after=db.prepare('SELECT * FROM quiz_attempts ORDER BY id').all();
    assert.deepEqual(after.map(({remaining_ms,paused_at,state_version,...row})=>row),before);
    assert(after.every(row=>row.state_version===0&&row.remaining_ms===null&&row.paused_at===null));
    assert.equal(db.prepare('PRAGMA user_version').get().user_version,4);
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0); db.close();
  }
});

test('maintenance removes expired metadata while keeping learning records', async t => {
  let clock=Date.now(); const f=await fixture(t,{now:()=>clock}); const user=await f.register();
  await f.request('/api/progress',{type:'module',id:'mod-2',completed:true,operationId:randomUUID()},user.cookie);
  await f.request('/api/auth/forgot-password',{email:user.body.user.email}); await f.app.flushMail();
  clock+=31*86400000; f.app.maintenance();
  const db=new DatabaseSync(path.join(f.directory,'test.sqlite'),{readOnly:true});
  for(const table of ['sessions','account_tokens','progress_events','rate_limits','mail_jobs']) assert.equal(db.prepare('SELECT COUNT(*) AS count FROM '+table).get().count,0,table);
  assert.equal(JSON.parse(db.prepare('SELECT data FROM progress').get().data).completedModules[0],'mod-2'); db.close();
});

test('backup CLI uses a read-only source and restore refuses to overwrite files', async t => {
  const f=await fixture(t); const user=await f.register();
  await f.request('/api/progress',{type:'module',id:'mod-4',completed:true,operationId:randomUUID()},user.cookie);
  await f.stop();
  fs.copyFileSync(path.join(f.directory,'test.sqlite'),path.join(f.directory,'scienceedu.sqlite'));
  const command=path.join(__dirname,'../tools/database-backup.js');
  const run=(...args)=>spawnSync(process.execPath,[command,...args],{encoding:'utf8',env:{...process.env,DATA_DIR:f.directory},windowsHide:true});
  const backup=run('backup'); assert.equal(backup.status,0,backup.stderr); const filename=backup.stdout.trim();
  const verified=run('verify',filename); assert.equal(verified.status,0); assert.equal(JSON.parse(verified.stdout).valid,true);
  const restored=path.join(f.directory,'cli-restored.sqlite'); assert.equal(run('restore',filename,restored).status,0);
  const before=fs.readFileSync(restored); assert.equal(run('restore',filename,restored).status,1); assert.deepEqual(fs.readFileSync(restored),before);
  const db=new DatabaseSync(restored,{readOnly:true}); assert.deepEqual(JSON.parse(db.prepare('SELECT data FROM progress').get().data).completedModules,['mod-4']); db.close();
});
