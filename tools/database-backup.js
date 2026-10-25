'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { backupDatabase, verifyBackup } = require('../backend/operations');
const envFile = path.join(__dirname, '../.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
const directory = process.env.DATA_DIR || path.join(__dirname,'../.data');
try {
  const command = process.argv[2] || 'backup';
  if (command === 'verify') {
    if (!process.argv[3]) throw new Error('Provide a backup filename.');
    console.log(JSON.stringify(verifyBackup(path.resolve(process.argv[3]))));
  } else if (command === 'restore') {
    const source = process.argv[3], destination = process.argv[4];
    if (!source || !destination) throw new Error('Usage: npm run restore -- <backup.sqlite> <new-database.sqlite>');
    verifyBackup(path.resolve(source));
    fs.mkdirSync(path.dirname(path.resolve(destination)),{recursive:true});
    fs.copyFileSync(path.resolve(source),path.resolve(destination),fs.constants.COPYFILE_EXCL);
    console.log('Restored to '+path.resolve(destination));
  } else if (command === 'backup') {
    const db = new DatabaseSync(path.join(directory,'scienceedu.sqlite'),{readOnly:true});
    try { console.log(backupDatabase(db,path.join(directory,'backups'))); } finally { db.close(); }
  } else throw new Error('Unknown command.');
} catch (error) { console.error(error.message); process.exitCode=1; }
