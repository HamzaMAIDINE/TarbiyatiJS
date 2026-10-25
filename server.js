'use strict';
require('./backend/runtime');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const catalog = require('./backend/catalog');
const { openDatabase, maintainDatabase } = require('./backend/database');
const { failure, readJson, ipAddress, clientIp, requestOrigin, createLimiter } = require('./backend/security');
const { sendFile } = require('./backend/static');
const { createLearning } = require('./backend/learning');
const { createQuizzes } = require('./backend/quizzes');
const { createMailer } = require('./backend/mail');
const { createAuth } = require('./backend/auth');
const { createAdmin } = require('./backend/admin');
const { backupDatabase } = require('./backend/operations');
const { createPublicSite } = require('./backend/seo');
const ROOT = __dirname;
const REAL_ROOT = fs.realpathSync(ROOT);
const CSP = "default-src 'self'; script-src 'self'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

function createApp({ databasePath = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'scienceedu.sqlite') : path.join(ROOT, '.data/scienceedu.sqlite'),
  publicOrigin = process.env.PUBLIC_ORIGIN, production = process.env.NODE_ENV === 'production',
  trustedProxies = (process.env.TRUSTED_PROXIES || '').split(',').filter(Boolean), now = Date.now,
  deliverMail, mailDirectory, smtp, brevo, fetchMail, emailWebhookUrl = process.env.EMAIL_WEBHOOK_URL, emailWebhookToken = process.env.EMAIL_WEBHOOK_TOKEN,
  adminEmails = (process.env.ADMIN_EMAIL || process.env.ADMIN_EMAILS || '').split(',').map(s=>s.trim()).filter(Boolean),
  logger = event => { if (production || event.event.startsWith('mail_')) console.log(JSON.stringify(event)); },
  backupIntervalHours = Number(process.env.BACKUP_INTERVAL_HOURS ?? 24) } = {}) {
  if (publicOrigin) {
    const url = new URL(publicOrigin);
    if (url.username || url.password || !['https:','http:'].includes(url.protocol) || url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid PUBLIC_ORIGIN; use only the scheme and host.');
    publicOrigin = url.origin;
  }
  if (production && !publicOrigin?.startsWith('https://')) throw new Error('Production requires PUBLIC_ORIGIN=https://your-domain and an HTTPS reverse proxy.');
  const proxies = new Set(trustedProxies.map(value => ipAddress(value.trim())));
  if ([...proxies].some(value => !require('node:net').isIP(value))) throw new Error('TRUSTED_PROXIES must contain explicit IP addresses.');
  if (!Number.isFinite(backupIntervalHours) || backupIntervalHours < 0 || backupIntervalHours > 2147483647 / 3600000) throw new Error('BACKUP_INTERVAL_HOURS must be 0 or a positive interval of at most 596 hours.');
  const publicSite = createPublicSite({ catalog, publicOrigin });
  const db = openDatabase(databasePath, now);
  const limiter = createLimiter(db, now);
  const learning = createLearning({ db, catalog, now, limiter });
  let mailer;
  try {
    mailer = createMailer({ db, now, production, deliverMail, smtp, brevo, fetchMail, logger, webhookUrl: emailWebhookUrl, webhookToken: emailWebhookToken,
      directory: mailDirectory ?? (databasePath === ':memory:' ? null : path.join(path.dirname(databasePath), 'mail')) });
  } catch (error) { db.close(); throw error; }
  const admin = createAdmin({ db, now, limiter, mailer, adminEmails });
  const auth = createAuth({ db, now, limiter, mailer, production, publicOrigin, adminEmails, isAdmin: admin.isAdmin });
  const quizzes = createQuizzes({ db, catalog, now, limiter, learning });
  const accountPayload = user => user.email_verified ? { user: auth.userView(user), progress: learning.progressFor(user.id), review: learning.reviewQueue(user.id),
    totals: { modules: catalog.modules.length, simulator: catalog.simulator.length, flashcards: catalog.flashcards.length, mindmaps: catalog.mindmaps.length } }
    : { user: auth.userView(user), verification: auth.verificationState(user) };
  const send = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
  const maintenance = () => { quizzes.finalizeExpired(); maintainDatabase(db, now()); };
  const backup = () => { if (databasePath === ':memory:') throw new Error('An in-memory database cannot be backed up by the server.'); return backupDatabase(db, path.join(path.dirname(databasePath), 'backups'), now()); };
  maintenance();
  const maintenanceTimer = setInterval(() => { try { maintenance(); } catch { logger({ event: 'maintenance_failed' }); } }, 3600000);
  maintenanceTimer.unref();
  const quizTimer = setInterval(() => { try { quizzes.finalizeExpired(); } catch { logger({ event: 'quiz_expiry_failed' }); } }, 30000);
  quizTimer.unref();
  const backupTimer = databasePath !== ':memory:' && Number.isFinite(backupIntervalHours) && backupIntervalHours > 0
    ? setInterval(() => { try { backup(); logger({ event: 'backup_completed' }); } catch { logger({ event: 'backup_failed' }); } }, Math.min(2147483647, backupIntervalHours * 3600000)) : null;
  backupTimer?.unref();

  let activeRequests = 0, resolveDrained;
  const server = http.createServer(async (req, res) => {
    activeRequests++;
    const requestId = crypto.randomUUID(); const started = Date.now();
    let route = '/';
    res.setHeader('X-Request-ID', requestId);
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin'); res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (production) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    res.on('finish', () => logger({ event: 'request', requestId, method: req.method, route, status: res.statusCode, durationMs: Date.now() - started }));
    try {
      // Parse inside the error boundary: invalid absolute targets must never reject
      // the async HTTP listener and terminate the process.
      if (!req.url.startsWith('/') || req.url.startsWith('//') || /[\\\x00-\x20\x7f]/.test(req.url)) throw failure(400, 'عنوان غير صالح.');
      const url = new URL(req.url, 'http://localhost'); route = url.pathname;
      const isPrivate = route.startsWith('/api/') || ['/pages/admin.html', '/pages/account.html', '/pages/settings.html'].includes(route);
      res.setHeader('X-Robots-Tag', isPrivate ? 'noindex, nofollow' : 'index, follow, max-image-preview:large');
      if (route.startsWith('/api/')) {
        if (!['GET','POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); throw failure(405, 'طريقة غير مدعومة.'); }
        if (route === '/api/health' && req.method === 'GET') { db.prepare('SELECT 1').get(); return send(res, 200, { status: 'ok' }); }
        const address = clientIp(req, proxies);
        const { origin, allowed: originAllowed } = requestOrigin(req, proxies, publicOrigin);
        if (req.method === 'POST' && (!originAllowed || req.headers['x-scienceedu-request'] !== '1' || req.headers['sec-fetch-site'] === 'cross-site')) throw failure(403, 'طلب غير مسموح.');
        if (route === '/api/session' && req.method === 'GET') { const user = auth.currentUser(req); return send(res, 200, user ? accountPayload(user) : { user: null }); }
        const publicPosts = ['/api/auth/register','/api/auth/login','/api/auth/forgot-password','/api/auth/reset-password','/api/auth/verify-email'];
        if (req.method === 'POST' && publicPosts.includes(route)) {
          limiter.check(`auth-ip:${address}`, 120, 60000);
          if (route === '/api/auth/register') limiter.check(`signup-ip:${address}`, 10, 15 * 60000);
          const body = await readJson(req);
          if (route === '/api/auth/register') return send(res, 201, accountPayload(await auth.register(req, res, body, origin)));
          if (route === '/api/auth/login') return send(res, 200, accountPayload(await auth.login(req, res, body)));
          if (route === '/api/auth/forgot-password') { limiter.check(`recovery-ip:${address}`, 20, 15 * 60000); return send(res, 200, auth.forgot(body, origin)); }
          if (route === '/api/auth/reset-password') return send(res, 200, await auth.reset(res, body));
          return send(res, 200, auth.verify(req, body));
        }
        if (route === '/api/auth/logout' && req.method === 'POST') { auth.logout(req, res); return send(res, 200, { user: null }); }
        const user = auth.currentUser(req);
        if (!user) throw failure(401, 'سجل الدخول لحفظ تقدمك.');
        const accountRoutes = ['/api/auth/sessions','/api/auth/request-verification','/api/auth/change-password','/api/auth/revoke-others','/api/auth/revoke-session'];
        if (!user.email_verified && !accountRoutes.includes(route)) throw Object.assign(failure(403, 'أكد بريدك الإلكتروني أولاً لمتابعة التعلم.'), { code: 'EMAIL_VERIFICATION_REQUIRED' });
        if (req.method === 'POST') {
          if (req.headers['x-scienceedu-user'] && req.headers['x-scienceedu-user'] !== user.id) throw Object.assign(failure(409, 'تغير الحساب في نافذة أخرى. سجل الدخول مرة أخرى.'), { code: 'ACCOUNT_CHANGED' });
          limiter.check(`write:${user.id}`, 300, 60000);
        }
        if (route.startsWith('/api/admin/')) {
          if (!user || !admin.isAdmin(user)) throw failure(403, 'غير مصرح بالوصول إلى لوحة الإدارة.');
          if (req.method === 'GET') {
            if (route === '/api/admin/overview') return send(res, 200, admin.getOverview());
            if (route === '/api/admin/users') return send(res, 200, admin.getUsers({ search: url.searchParams.get('search'), filter: url.searchParams.get('filter'), page: url.searchParams.get('page'), limit: url.searchParams.get('limit') }));
            if (route === '/api/admin/users/detail') return send(res, 200, admin.getUserDetail(url.searchParams.get('id')));
            if (route === '/api/admin/mail-jobs') return send(res, 200, admin.getMailJobs({ status: url.searchParams.get('status'), limit: url.searchParams.get('limit') }));
          } else {
            const body = await readJson(req);
            if (route === '/api/admin/users/verify') return send(res, 200, admin.verifyUser(body.id));
            if (route === '/api/admin/users/unverify') return send(res, 200, admin.unverifyUser(body.id));
            if (route === '/api/admin/users/reset-password') return send(res, 200, admin.triggerPasswordReset(body.id, origin));
            if (route === '/api/admin/users/delete') return send(res, 200, admin.deleteUser(body.id, user.id));
            if (route === '/api/admin/mail-jobs/retry') return send(res, 200, admin.retryFailedMail());
          }
          throw failure(404, 'الطلب غير موجود.');
        }
        const reply = body => send(res, 200, { ...body, user: auth.userView(user) });
        if (req.method === 'GET') {
          if (route === '/api/progress') return send(res, 200, accountPayload(user));
          if (route === '/api/reviews') return reply(learning.reviewQueue(user.id));
          if (route === '/api/auth/sessions') return reply(auth.sessions(req, user));
          if (route === '/api/quizzes/active') return reply(quizzes.active(user.id, url.searchParams.get('scope') || 'all'));
          if (route === '/api/quizzes/attempt') return reply(quizzes.get(user.id, url.searchParams.get('id')));
          if (route === '/api/quizzes/history') return reply(quizzes.history(user.id));
          if (route === '/api/quizzes/catalog') return reply(quizzes.describe());
          if (route === '/api/exams') return reply({ exams: quizzes.examLibrary() });
          if (route === '/api/drafts') return reply({ drafts: learning.listDrafts(user.id) });
          if (route === '/api/drafts/detail') return reply({ draft: learning.getDraft(url.searchParams.get('id'), user.id) });
        } else {
          const body = await readJson(req);
          if (route === '/api/progress') return reply({ progress: learning.applyEvent(user.id, body), review: learning.reviewQueue(user.id) });
          if (route === '/api/quizzes/start') return reply(quizzes.start(user.id, body));
          if (route === '/api/quizzes/pause') return reply(quizzes.pause(user.id, body));
          if (route === '/api/quizzes/resume') return reply(quizzes.resume(user.id, body));
          if (route === '/api/quizzes/answer') return reply(quizzes.answer(user.id, body));
          if (route === '/api/quizzes/submit') return reply(quizzes.submit(user.id, body.attemptId));
          if (route === '/api/drafts/save') return reply({ draft: learning.saveDraft(user.id, body) });
          if (route === '/api/drafts/delete') { learning.deleteDraft(body.id, user.id, body.version); return reply({ deleted: true }); }
          if (route === '/api/auth/request-verification') return reply(auth.requestVerification(user, origin));
          if (route === '/api/auth/change-password') return reply(await auth.changePassword(req, res, user, body));
          if (route === '/api/auth/revoke-others') return reply(auth.revokeOtherSessions(req, user));
          if (route === '/api/auth/revoke-session') return reply(auth.revokeSession(req, res, user, body));
        }
        throw failure(404, 'الطلب غير موجود.');
      }
      if (!['GET','HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); throw failure(405, 'طريقة غير مدعومة.'); }
      if (publicSite.handle(req, res, url)) return;
      let relative;
      try { relative = decodeURIComponent(route).replace(/^\/+/, '') || 'index.html'; }
      catch { throw failure(400, 'عنوان غير صالح.'); }
      const allowed = /^(?:index\.html|pages\/[a-z-]+\.html|(?:styles|scripts|assets)\/[a-zA-Z0-9_./-]+\.(?:css|js|svg)|assets\/[a-zA-Z0-9_./-]+\.(?:png|jpe?g)|assets\/fonts\/[a-zA-Z0-9_-]+\.(?:ttf|woff2)|PDFs\/[^/\\]+\.pdf)$/.test(relative);
      const resolved = path.resolve(ROOT, relative);
      const protectedQuizSource = resolved.toLowerCase() === path.join(ROOT,'scripts/data/quizData.js').toLowerCase();
      if (!allowed || protectedQuizSource || !resolved.startsWith(ROOT + path.sep) || relative.includes('..') || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw failure(404, 'الصفحة غير موجودة.');
      // A link/junction inside the public tree must not expose private files or
      // create a second public name for the server-only answer bank.
      const actual = fs.realpathSync(resolved), expected = path.resolve(REAL_ROOT, relative);
      if ((process.platform === 'win32' ? actual.toLowerCase() !== expected.toLowerCase() : actual !== expected)) throw failure(404, 'الصفحة غير موجودة.');
      if (relative.endsWith('.html') && !['index.html','pages/account.html'].includes(relative)) {
        const user = auth.currentUser(req);
        if (!user || !user.email_verified) {
          res.writeHead(302, { Location: `/pages/account.html?${user ? 'mode=pending&' : ''}next=${encodeURIComponent(req.url)}` }); return res.end();
        }
        if (relative === 'pages/admin.html' && !admin.isAdmin(user)) {
          res.writeHead(302, { Location: '/pages/dashboard.html' }); return res.end();
        }
      }
      if (['assets/branding/logo.png','assets/branding/social-card.png'].includes(relative)) res.setHeader('X-Robots-Tag', 'index, follow, max-image-preview:large');
      return sendFile(req, res, resolved);
    } catch (error) {
      req.resume();
      if (error.status === 413) res.shouldKeepAlive = false;
      if (!error.status) logger({ event: 'request_failed', requestId, route, errorCode: 'INTERNAL_ERROR' });
      if (error.retryAfter) res.setHeader('Retry-After', error.retryAfter);
      if (!res.headersSent) send(res, error.status || 500, { error: error.status ? error.message : 'تعذر إتمام الطلب. حاول مرة أخرى.', ...(error.code ? { code: error.code } : {}), requestId });
      else res.end();
    } finally { activeRequests--; if (!activeRequests) resolveDrained?.(); }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000; server.maxRequestsPerSocket = 100;
  server.maxConnections = 256;
  let closing = Promise.resolve();
  server.on('close', () => {
    clearInterval(maintenanceTimer); clearInterval(backupTimer); clearInterval(quizTimer);
    closing = (activeRequests ? new Promise(resolve => { resolveDrained = resolve; }) : Promise.resolve())
      .then(() => mailer.stop()).finally(() => db.close());
  });
  let stopping;
  const shutdown = () => stopping ||= new Promise(resolve => server.close(resolve)).then(() => closing);
  return { server, maintenance, backup, flushMail: mailer.flush, closed: () => closing, shutdown };
}

if (require.main === module) {
  const envFile = path.join(ROOT, '.env');
  if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
  if (process.env.NODE_ENV && !['production', 'development', 'test'].includes(process.env.NODE_ENV)) throw new Error('NODE_ENV must be production, development or test.');
  const port = Number(process.env.PORT || 3000); const host = process.env.HOST || '127.0.0.1';
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535.');
  const app = createApp();
  app.server.once('error', error => {
    console.error(JSON.stringify({ event: 'listen_failed', errorCode: error.code }));
    app.shutdown().finally(() => { process.exitCode = 1; });
  });
  app.server.listen(port, host, () => console.log(`Tarbiyati: http://${host}:${port}`));
  let stopping = false;
  for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    const forceConnections = setTimeout(() => app.server.closeAllConnections(), 30000);
    forceConnections.unref();
    app.shutdown().catch(() => { process.exitCode = 1; }).finally(() => clearTimeout(forceConnections));
  });
}
module.exports = { createApp };
