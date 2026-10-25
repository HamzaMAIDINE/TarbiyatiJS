'use strict';
const crypto = require('node:crypto');
const { transaction } = require('./database');
const { failure, tokenHash, cookieToken, passwordHasher } = require('./security');
const SESSION_SECONDS = 7 * 86400;
const VERIFICATION_MS = 10 * 60000;
const GENERIC_RECOVERY = 'إذا كان البريد مسجلاً، ستصلك رسالة لاستعادة كلمة المرور.';
function sessionDevice(agent) {
  const browser = /Edg\//.test(agent) ? 'Edge' : /Firefox\//.test(agent) ? 'Firefox' : /Chrome\//.test(agent) ? 'Chrome' : /Safari\//.test(agent) ? 'Safari' : 'متصفح';
  const platform = /Android/.test(agent) ? 'Android' : /iPhone|iPad/.test(agent) ? 'iOS' : /Windows/.test(agent) ? 'Windows' : /Macintosh/.test(agent) ? 'macOS' : /Linux/.test(agent) ? 'Linux' : '';
  return platform ? `${browser} · ${platform}` : browser;
}
function createAuth({ db, now, limiter, mailer, production, publicOrigin, adminEmails = process.env.ADMIN_EMAIL, isAdmin }) {
  const hashPassword = passwordHasher();
  const secureCookie = production || publicOrigin?.startsWith('https://');
  const dummySalt = crypto.randomBytes(16).toString('hex');
  const dummyHash = crypto.randomBytes(32);
  const adminCheck = isAdmin || (u => (String(adminEmails || '').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean).includes(u?.email?.toLowerCase())));
  const userView = user => ({ id: user.id, name: user.name, email: user.email, emailVerified: Boolean(user.email_verified), isAdmin: Boolean(adminCheck(user)) });
  const currentUser = req => {
    const token = cookieToken(req);
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    return db.prepare('SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires_at>?').get(tokenHash(token), now()) || null;
  };
  function clearCookie(res) { res.setHeader('Set-Cookie', `edu_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secureCookie ? '; Secure' : ''}`); }
  function setSession(req, res, id) {
    const old = cookieToken(req);
    if (old) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash(old));
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,id,created_at,user_agent) VALUES(?,?,?,?,?,?)')
      .run(tokenHash(token), id, now() + SESSION_SECONDS * 1000, crypto.randomUUID(), now(), String(req.headers['user-agent'] || '').slice(0,256));
    db.prepare(`DELETE FROM sessions WHERE user_id=? AND token_hash!=? AND token_hash NOT IN
      (SELECT token_hash FROM sessions WHERE user_id=? AND token_hash!=? AND expires_at>? ORDER BY created_at DESC, rowid DESC LIMIT 9)`)
      .run(id, tokenHash(token), id, tokenHash(token), now());
    res.setHeader('Set-Cookie', `edu_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_SECONDS}${secureCookie ? '; Secure' : ''}`);
  }
  function email(body) {
    const value = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (value.length > 254 || /[\x00-\x1f\x7f<>"\\,;:]/.test(value) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw failure(400, 'أدخل بريداً إلكترونياً صالحاً.');
    return value;
  }
  function password(value, minimum = 10) {
    if (typeof value !== 'string' || value.length < minimum || value.length > 128) throw failure(400, `استخدم كلمة مرور من ${minimum} أحرف على الأقل وبحد أقصى 128 حرفاً.`);
    return value;
  }
  async function matches(value, user) {
    const actual = await hashPassword(value, user?.password_salt || dummySalt);
    return crypto.timingSafeEqual(actual, user ? Buffer.from(user.password_hash, 'hex') : dummyHash) && Boolean(user);
  }
  function writeToken(user, purpose, origin) {
    const previous = db.prepare('SELECT token_hash FROM account_tokens WHERE user_id=? AND purpose=?').get(user.id, purpose);
    let token, hash;
    do {
      token = purpose === 'verify' ? String(crypto.randomInt(1000000)).padStart(6, '0') : crypto.randomBytes(32).toString('hex');
      hash = purpose === 'verify' ? tokenHash(`verify:${user.id}:${token}`) : tokenHash(token);
    } while (hash === previous?.token_hash);
    db.prepare('DELETE FROM account_tokens WHERE user_id=? AND purpose=?').run(user.id, purpose);
    db.prepare('INSERT INTO account_tokens VALUES(?,?,?,?)').run(hash, user.id, purpose, now() + (purpose === 'reset' ? 3600000 : VERIFICATION_MS));
    const text = purpose === 'verify'
      ? `رمز تأكيد بريدك الإلكتروني في تربيتي (Tarbiyati):\n\n${token}\n\nأدخل هذا الرمز المكون من 6 أرقام في المنصة خلال 10 دقائق. لا تشاركه مع أي شخص.`
      : `استخدم الرابط لتغيير كلمة المرور خلال ساعة:\n${publicOrigin || origin}/pages/account.html?mode=reset#token=${token}`;
    mailer.queue(user.email, purpose === 'reset' ? 'استعادة كلمة المرور — تربيتي | Tarbiyati' : 'تأكيد البريد الإلكتروني — تربيتي | Tarbiyati',
      `${text}\n\nإذا لم تطلب هذه الرسالة، تجاهلها.`, hash);
  }
  function issueToken(user, purpose, origin) { transaction(db, () => writeToken(user,purpose,origin)); }
  function verificationState(user) {
    const cooldown = db.prepare('SELECT until FROM rate_limits WHERE key=?').get(`verification-cooldown:${user.id}`);
    const quota = db.prepare('SELECT count,until FROM rate_limits WHERE key=?').get(`verification:${user.id}`);
    const until = Math.max(cooldown?.until || 0, quota?.count >= 3 ? quota.until : 0);
    const job = db.prepare(`SELECT j.status,j.attempts,t.expires_at FROM account_tokens t
      LEFT JOIN mail_jobs j ON j.token_hash=t.token_hash WHERE t.user_id=? AND t.purpose='verify'
      ORDER BY j.created_at DESC LIMIT 1`).get(user.id);
    const deliveryStatus = !job || job.expires_at <= now() ? 'expired' : job.status === 'pending' && job.attempts > 0 ? 'retrying' : job.status || 'pending';
    return { required: !Boolean(user.email_verified), retryAfter: Math.max(0,Math.ceil((until - now()) / 1000)),
      delivery: mailer.delivery, deliveryStatus, expiresIn: VERIFICATION_MS / 1000 };
  }
  function tokenRecord(token, purpose) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw failure(400, 'رابط غير صالح أو منتهي. اطلب رسالة جديدة.');
    const row = db.prepare('SELECT * FROM account_tokens WHERE token_hash=? AND purpose=? AND expires_at>?').get(tokenHash(token), purpose, now());
    if (!row) throw failure(400, 'رابط غير صالح أو منتهي. اطلب رسالة جديدة.');
    return row;
  }
  return { currentUser, userView, setSession, clearCookie, verificationState,
    async register(req, res, body, origin) {
      const address = email(body); const secret = password(body.password);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (name.length < 2 || name.length > 80) throw failure(400, 'أدخل اسماً من حرفين إلى 80 حرفاً.');
      if (db.prepare('SELECT id FROM users WHERE email=?').get(address)) throw failure(409, 'هذا البريد مسجل بالفعل. سجل الدخول إلى حسابك.');
      if (!mailer.available) throw failure(503, 'التسجيل غير متاح مؤقتاً لأن خدمة تأكيد البريد غير متاحة. حاول لاحقاً.');
      const salt = crypto.randomBytes(16).toString('hex'); const hash = (await hashPassword(secret, salt)).toString('hex');
      const user = { id: crypto.randomUUID(), name, email: address, email_verified: 0 };
      try { transaction(db, () => {
        db.prepare('INSERT INTO users(id,name,email,password_hash,password_salt,created_at) VALUES(?,?,?,?,?,?)').run(user.id, name, address, hash, salt, new Date(now()).toISOString());
        limiter.check(`verification:${user.id}`, 3, 15 * 60000);
        limiter.check(`verification-cooldown:${user.id}`, 1, 60000);
        writeToken(user,'verify',origin);
        setSession(req, res, user.id);
      }); }
      catch (error) { if (db.prepare('SELECT id FROM users WHERE email=?').get(address)) throw failure(409, 'هذا البريد مسجل بالفعل.'); throw error; }
      return user;
    },
    async login(req, res, body) {
      const address = email(body); const secret = password(body.password, 1);
      const key = `login:${tokenHash(address)}`;
      limiter.check(key, 10, 15 * 60000, false);
      const user = db.prepare('SELECT * FROM users WHERE email=?').get(address);
      if (!await matches(secret, user)) { limiter.check(key, 10, 15 * 60000); throw failure(401, 'البريد الإلكتروني أو كلمة المرور غير صحيحة.'); }
      return transaction(db, () => {
        const current = db.prepare('SELECT * FROM users WHERE id=?').get(user.id);
        if (current?.password_hash !== user.password_hash) throw failure(401, 'تغيرت كلمة المرور. سجل الدخول بالكلمة الجديدة.');
        limiter.clear(key); setSession(req, res, user.id); return current;
      });
    },
    logout(req, res) { db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash(cookieToken(req))); clearCookie(res); },
    forgot(body, origin) {
      const address = email(body);
      if (!mailer.available) throw failure(503, 'خدمة البريد غير متاحة الآن. حاول لاحقاً.');
      try { limiter.check(`recovery:${tokenHash(address)}`, 3, 15 * 60000); }
      catch (error) { if (error.status === 429) return { message: GENERIC_RECOVERY }; throw error; }
      const user = db.prepare('SELECT * FROM users WHERE email=?').get(address);
      if (user) issueToken(user, 'reset', origin);
      return { message: GENERIC_RECOVERY };
    },
    requestVerification(user, origin) {
      if (user.email_verified) return { message: 'بريدك مؤكد بالفعل.' };
      if (!mailer.available) throw failure(503, 'خدمة البريد غير متاحة الآن. حاول لاحقاً.');
      transaction(db, () => {
        limiter.check(`verification-cooldown:${user.id}`, 1, 60000);
        limiter.check(`verification:${user.id}`, 3, 15 * 60000);
        writeToken(user,'verify',origin);
      });
      return { message: 'جارٍ إرسال رمز تأكيد جديد إلى بريدك الإلكتروني.', verification: verificationState(user) };
    },
    verify(req, body) {
      const result = transaction(db, () => {
        let row;
        if (body.code !== undefined) {
          const user = currentUser(req);
          if (!user) throw failure(401, 'سجل الدخول لإدخال رمز تأكيد البريد.');
          if (req.headers['x-scienceedu-user'] && req.headers['x-scienceedu-user'] !== user.id)
            throw Object.assign(failure(409, 'تغير الحساب في نافذة أخرى. سجل الدخول مرة أخرى.'), { code: 'ACCOUNT_CHANGED' });
          const key = `verification-attempts:${user.id}`;
          limiter.check(key, 5, 15 * 60000, false);
          const code = typeof body.code === 'string' ? body.code.trim() : '';
          if (/^[0-9]{6}$/.test(code)) row = db.prepare("SELECT * FROM account_tokens WHERE token_hash=? AND user_id=? AND purpose='verify' AND expires_at>?")
            .get(tokenHash(`verify:${user.id}:${code}`), user.id, now());
          if (!row) {
            limiter.check(key, 5, 15 * 60000);
            // Commit failed-attempt accounting before returning the public error.
            return { error: failure(400, 'رمز غير صحيح أو منتهي الصلاحية. أدخل 6 أرقام أو اطلب رمزاً جديداً.') };
          }
        } else {
          // Previously issued confirmation links remain valid until their original expiry.
          row = tokenRecord(body.token, 'verify');
        }
        db.prepare('UPDATE users SET email_verified=1 WHERE id=?').run(row.user_id);
        db.prepare("DELETE FROM account_tokens WHERE user_id=? AND purpose='verify'").run(row.user_id);
        limiter.clear(`verification:${row.user_id}`); limiter.clear(`verification-cooldown:${row.user_id}`);
        limiter.clear(`verification-attempts:${row.user_id}`);
        return { message: 'تم تأكيد بريدك الإلكتروني.' };
      });
      if (result.error) throw result.error;
      return result;
    },
    async reset(res, body) {
      const row = tokenRecord(body.token, 'reset'); const secret = password(body.password);
      const salt = crypto.randomBytes(16).toString('hex'); const hash = (await hashPassword(secret, salt)).toString('hex');
      transaction(db, () => {
        tokenRecord(body.token, 'reset');
        db.prepare('UPDATE users SET password_hash=?,password_salt=? WHERE id=?').run(hash, salt, row.user_id);
        db.prepare('DELETE FROM account_tokens WHERE user_id=?').run(row.user_id);
        db.prepare('DELETE FROM sessions WHERE user_id=?').run(row.user_id);
        limiter.clear(`login:${tokenHash(db.prepare('SELECT email FROM users WHERE id=?').get(row.user_id).email)}`);
      });
      clearCookie(res); return { message: 'تم تغيير كلمة المرور وإنهاء الجلسات السابقة. سجل الدخول بكلمتك الجديدة.' };
    },
    async changePassword(req, res, user, body) {
      limiter.check(`password-change:${user.id}`, 10, 15 * 60000);
      if (!await matches(password(body.currentPassword, 1), user)) throw failure(401, 'كلمة المرور الحالية غير صحيحة.');
      const secret = password(body.password); const salt = crypto.randomBytes(16).toString('hex'); const hash = (await hashPassword(secret, salt)).toString('hex');
      transaction(db, () => {
        const changed = db.prepare('UPDATE users SET password_hash=?,password_salt=? WHERE id=? AND password_hash=?').run(hash, salt, user.id, user.password_hash);
        if (!changed.changes) throw failure(409, 'تغيرت كلمة المرور. سجل الدخول مرة أخرى.');
        db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
        db.prepare("DELETE FROM account_tokens WHERE user_id=? AND purpose='reset'").run(user.id);
        setSession(req, res, user.id);
      });
      return { message: 'تم تغيير كلمة المرور وإنهاء الجلسات الأخرى.' };
    },
    sessions(req, user) {
      const current = tokenHash(cookieToken(req));
      return { sessions: db.prepare('SELECT id,token_hash,created_at,expires_at,user_agent FROM sessions WHERE user_id=? AND expires_at>? ORDER BY created_at DESC').all(user.id, now())
        .map(row => ({ id: row.id, current: row.token_hash === current, createdAt: row.created_at, expiresAt: row.expires_at, device: sessionDevice(row.user_agent) })) };
    },
    revokeOtherSessions(req, user) { db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash!=?').run(user.id, tokenHash(cookieToken(req))); return { message: 'تم إنهاء الجلسات الأخرى.' }; },
    revokeSession(req, res, user, body) {
      if (typeof body.id !== 'string' || !/^[a-f0-9-]{32,36}$/.test(body.id)) throw failure(400, 'جلسة غير صالحة.');
      const row = db.prepare('SELECT token_hash FROM sessions WHERE id=? AND user_id=?').get(body.id, user.id);
      if (!row) throw failure(404, 'الجلسة غير موجودة.');
      db.prepare('DELETE FROM sessions WHERE id=? AND user_id=?').run(body.id, user.id);
      const current = row.token_hash === tokenHash(cookieToken(req)); if (current) clearCookie(res);
      return { current, message: 'تم إنهاء الجلسة.' };
    }
  };
}
module.exports = { createAuth };
