'use strict';
const { transaction } = require('./database');
const crypto = require('node:crypto');
const { failure, tokenHash, UUID } = require('./security');

function userIdentifier(id) {
  if (typeof id !== 'string' || !UUID.test(id)) throw failure(400, 'معرف المستخدم غير صالح.');
  return id;
}
function positiveInteger(value, fallback, maximum) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum) throw failure(400, 'قيم التصفح غير صالحة.');
  return number;
}

function createAdmin({ db, now, limiter, mailer, adminEmails = [] }) {
  const normalizedAdminEmails = new Set(
    (Array.isArray(adminEmails) ? adminEmails : [adminEmails])
      .flatMap(item => String(item || '').split(','))
      .map(email => email.trim().toLowerCase())
      .filter(Boolean)
  );

  function isAdmin(user) {
    if (!user || !user.email) return false;
    return normalizedAdminEmails.has(user.email.toLowerCase());
  }

  function getOverview() {
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const verifiedUsers = db.prepare('SELECT COUNT(*) as count FROM users WHERE email_verified=1').get().count;
    const unverifiedUsers = totalUsers - verifiedUsers;

    const totalQuizzes = db.prepare("SELECT COUNT(*) as count FROM quiz_attempts WHERE status='submitted'").get().count;
    const avgScoreResult = db.prepare("SELECT AVG(score) as avg_score FROM quiz_attempts WHERE status='submitted' AND score IS NOT NULL").get();
    const avgScore = avgScoreResult && avgScoreResult.avg_score != null ? Math.round(avgScoreResult.avg_score) : 0;

    const examAttempts = db.prepare("SELECT COUNT(*) as count FROM quiz_attempts WHERE mode='exam' AND status='submitted'").get().count;
    const practiceAttempts = db.prepare("SELECT COUNT(*) as count FROM quiz_attempts WHERE mode='practice' AND status='submitted'").get().count;

    const totalDrafts = db.prepare('SELECT COUNT(*) as count FROM lesson_drafts').get().count;
    const activeSessions = db.prepare('SELECT COUNT(DISTINCT user_id) as count FROM sessions WHERE expires_at>?').get(now()).count;

    const mailSent = db.prepare("SELECT COUNT(*) as count FROM mail_jobs WHERE status='sent'").get().count;
    const mailPending = db.prepare("SELECT COUNT(*) as count FROM mail_jobs WHERE status='pending'").get().count;
    const mailFailed = db.prepare("SELECT COUNT(*) as count FROM mail_jobs WHERE status='failed'").get().count;

    // Recent 5 users
    const recentUsers = db.prepare(`
      SELECT id, name, email, email_verified, created_at 
      FROM users 
      ORDER BY created_at DESC 
      LIMIT 5
    `).all().map(u => ({ ...u, email_verified: Boolean(u.email_verified) }));

    return {
      stats: {
        totalUsers,
        verifiedUsers,
        unverifiedUsers,
        verifiedPercent: totalUsers > 0 ? Math.round((verifiedUsers / totalUsers) * 100) : 0,
        totalQuizzes,
        avgScore,
        examAttempts,
        practiceAttempts,
        totalDrafts,
        activeSessions,
        mail: {
          sent: mailSent,
          pending: mailPending,
          failed: mailFailed
        }
      },
      recentUsers
    };
  }

  function getUsers({ search = '', filter = 'all', page = 1, limit = 20 } = {}) {
    const safePage = positiveInteger(page, 1, 1000000);
    const safeLimit = positiveInteger(limit, 20, 100);
    const offset = (safePage - 1) * safeLimit;

    let whereClause = '1=1';
    const params = [];

    if (filter === 'verified') {
      whereClause += ' AND email_verified = 1';
    } else if (filter === 'unverified') {
      whereClause += ' AND email_verified = 0';
    }

    if (search && (typeof search !== 'string' || search.length > 200)) throw failure(400, 'نص البحث طويل أو غير صالح.');
    if (search && search.trim()) {
      whereClause += ' AND (name LIKE ? OR email LIKE ?)';
      const term = `%${search.trim().toLowerCase()}%`;
      params.push(term, term);
    }

    const totalCount = db.prepare(`SELECT COUNT(*) as count FROM users WHERE ${whereClause}`).get(...params).count;

    const users = db.prepare(`
      SELECT u.id, u.name, u.email, u.email_verified, u.created_at,
        (SELECT COUNT(*) FROM quiz_attempts q WHERE q.user_id = u.id AND q.status = 'submitted') as quizzes_taken,
        (SELECT ROUND(AVG(score)) FROM quiz_attempts q WHERE q.user_id = u.id AND q.status = 'submitted' AND q.score IS NOT NULL) as avg_score,
        (SELECT MAX(created_at) FROM sessions s WHERE s.user_id = u.id) as last_session_at
      FROM users u
      WHERE ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, safeLimit, offset).map(user => ({
      ...user,
      email_verified: Boolean(user.email_verified),
      avg_score: user.avg_score != null ? Number(user.avg_score) : null
    }));

    return {
      users,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / safeLimit) || 1
      }
    };
  }

  function getUserDetail(userId) {
    userIdentifier(userId);
    const user = db.prepare('SELECT id, name, email, email_verified, created_at FROM users WHERE id=?').get(userId);
    if (!user) throw failure(404, 'المستخدم غير موجود.');

    const progressRow = db.prepare('SELECT data FROM progress WHERE user_id=?').get(userId);
    const progress = progressRow ? JSON.parse(progressRow.data) : null;

    const recentQuizzes = db.prepare(`
      SELECT id, mode, score, pool_size, created_at, finished_at, status
      FROM quiz_attempts
      WHERE user_id=?
      ORDER BY created_at DESC
      LIMIT 10
    `).all(userId);

    const activeSessions = db.prepare(`
      SELECT id, user_agent, created_at, expires_at
      FROM sessions
      WHERE user_id=? AND expires_at>?
      ORDER BY created_at DESC
    `).all(userId, now());

    const drafts = db.prepare(`
      SELECT id, title, version, updated_at
      FROM lesson_drafts
      WHERE user_id=?
      ORDER BY updated_at DESC
      LIMIT 10
    `).all(userId);

    return {
      user: { ...user, email_verified: Boolean(user.email_verified) },
      progress,
      recentQuizzes,
      activeSessions,
      drafts
    };
  }

  function verifyUser(userId) {
    userIdentifier(userId);
    const user = db.prepare('SELECT id, email FROM users WHERE id=?').get(userId);
    if (!user) throw failure(404, 'المستخدم غير موجود.');

    transaction(db, () => {
      db.prepare('UPDATE users SET email_verified=1 WHERE id=?').run(userId);
      db.prepare("DELETE FROM account_tokens WHERE user_id=? AND purpose='verify'").run(userId);
    });

    return { success: true, message: `تم تفعيل حساب ${user.email} بنجاح.` };
  }

  function unverifyUser(userId) {
    userIdentifier(userId);
    const user = db.prepare('SELECT id, email FROM users WHERE id=?').get(userId);
    if (!user) throw failure(404, 'المستخدم غير موجود.');

    db.prepare('UPDATE users SET email_verified=0 WHERE id=?').run(userId);
    return { success: true, message: `تم إلغاء تفعيل حساب ${user.email}.` };
  }

  function triggerPasswordReset(userId, origin) {
    userIdentifier(userId);
    const user = db.prepare('SELECT id, email, name FROM users WHERE id=?').get(userId);
    if (!user) throw failure(404, 'المستخدم غير موجود.');
    if (!mailer.available) throw failure(503, 'خدمة البريد غير متاحة الآن. حاول لاحقاً.');
    limiter.check(`admin-reset:${userId}`, 3, 15 * 60000);
    const token = crypto.randomBytes(32).toString('hex');
    const hash = tokenHash(token);

    transaction(db, () => {
      db.prepare("DELETE FROM account_tokens WHERE user_id=? AND purpose='reset'").run(userId);
      db.prepare('INSERT INTO account_tokens VALUES(?,?,?,?)').run(hash, userId, 'reset', now() + 3600000);
      const text = `تم إنشاء رابط لإعادة تعيين كلمة المرور من قبل إدارة تربيتي (Tarbiyati):\n\n${origin}/pages/account.html?mode=reset#token=${token}\n\nهذا الرابط صالح لمدة ساعة واحدة فقط.`;
      mailer.queue(user.email, 'إعادة تعيين كلمة المرور — إدارة تربيتي | Tarbiyati', text, hash);
    });

    return { success: true, message: `تم إرسال رابط إعادة تعيين كلمة المرور إلى ${user.email}.` };
  }

  function deleteUser(userId, currentAdminId) {
    userIdentifier(userId);
    if (userId === currentAdminId) {
      throw failure(400, 'لا يمكنك حذف حسابك الشخصي الذي تستخدمه حالياً للإدارة.');
    }
    const user = db.prepare('SELECT id, email FROM users WHERE id=?').get(userId);
    if (!user) throw failure(404, 'المستخدم غير موجود.');

    transaction(db, () => {
      db.prepare('DELETE FROM users WHERE id=?').run(userId);
    });

    return { success: true, message: `تم حذف حساب ${user.email} وكافة بياناته المرتبطة بنجاح.` };
  }

  function getMailJobs({ status, limit = 50 } = {}) {
    let sql = 'SELECT id, recipient, subject, status, attempts, created_at, next_attempt FROM mail_jobs';
    const params = [];
    if (status && ['pending', 'sent', 'failed'].includes(status)) {
      sql += ' WHERE status=?';
      params.push(status);
    }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(positiveInteger(limit, 50, 200));

    return { jobs: db.prepare(sql).all(...params) };
  }

  function retryFailedMail() {
    // Cleared or expired messages need a new verification/reset request, never an empty resend.
    const count = db.prepare(`UPDATE mail_jobs SET status='pending', attempts=0, next_attempt=?
      WHERE status='failed' AND body!='' AND (token_hash IS NULL OR EXISTS
        (SELECT 1 FROM account_tokens WHERE account_tokens.token_hash=mail_jobs.token_hash AND expires_at>?))`).run(now(), now()).changes;
    if (count > 0 && mailer?.flush) {
      mailer.flush().catch(() => {});
    }
    return { success: true, count, message: `تمت جدولة ${count} رسالة فاشلة لإعادة الإرسال فوراً.` };
  }

  return {
    isAdmin,
    getOverview,
    getUsers,
    getUserDetail,
    verifyUser,
    unverifyUser,
    triggerPasswordReset,
    deleteUser,
    getMailJobs,
    retryFailedMail
  };
}

module.exports = { createAdmin };
