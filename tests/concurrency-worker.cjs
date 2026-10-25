'use strict';
// Private process fixture. It has no HTTP route and never contacts a mail provider.
if (!process.send) throw new Error('This fixture requires its test parent.');
const { openDatabase } = require('../backend/database');
const { createLimiter } = require('../backend/security');
const { createLearning } = require('../backend/learning');
const { createQuizzes } = require('../backend/quizzes');
const { createAuth } = require('../backend/auth');
const catalog = require('../backend/catalog');
process.once('message', options => {
  const db = openDatabase(options.databasePath);
  const now = Date.now;
  const limiter = createLimiter(db, now);
  const learning = createLearning({ db, now, limiter, catalog });
  const quizzes = createQuizzes({ db, now, limiter, learning, catalog });
  const auth = createAuth({ db, now, limiter, mailer: { available: true, delivery: 'preview', queue() {} }, production: false });
  process.send({ ready: true });
  process.once('message', async job => {
    try {
      let body;
      if (job.operation === 'limit') { limiter.check(job.key, job.maximum, 60000); body = { accepted: true }; }
      else if (job.operation === 'submit') body = quizzes.submit(job.userId, job.attemptId);
      else if (job.operation === 'event') body = learning.applyEvent(job.userId, job.event);
      else if (job.operation === 'delete') { learning.deleteDraft(job.id, job.userId, job.version); body = { deleted: true }; }
      else if (job.operation === 'verify') body = auth.verify({ headers: { cookie: job.cookie } }, { code: job.code });
      else throw new Error('Unknown fixture operation.');
      process.send({ status: 200, body });
    } catch (error) { process.send({ status: error.status || 500, code: error.code }); }
    finally { db.close(); process.disconnect(); }
  });
});
