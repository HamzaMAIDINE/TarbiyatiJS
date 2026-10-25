/* Account session and server-backed learning progress. No passwords or session tokens
   are stored in localStorage; the server uses an HttpOnly session cookie. */
const DEFAULT_LEARNING_PROGRESS = {
  completedModules: [], quizScore: 0, lastQuizScore: null, quizzesTaken: 0,
  simulatorCompleted: [], masteredFlashcards: [], reviewFlashcards: [],
  flashcardsMastered: 0, mindmapsViewed: [], lastModuleId: null, lastActive: null
};
let learningProgress = structuredClone(DEFAULT_LEARNING_PROGRESS);
let progressQueue = Promise.resolve();
let progressPending = 0;
let progressRefresh = null;
let progressSaveFailed = false;
let learningReview = { dueIds: [], nextReview: null };
let unsavedLearningEvents = [];
function outboxKey() { return `edu_pending_${AccountManager.user?.id}`; }
function persistLearningOutbox() {
  try { localStorage.setItem(outboxKey(), JSON.stringify(unsavedLearningEvents)); }
  catch { /* The current visit still retains failed saves when browser storage is unavailable. */ }
}
function publicAccountFlow() { return ['forgot','reset','verify'].includes(new URLSearchParams(location.search).get('mode')); }

function accountPageUrl() {
  return window.location.pathname.includes('/pages/') ? 'account.html' : 'pages/account.html';
}
function isAccountPage() { return window.location.pathname.endsWith('/pages/account.html'); }
function signInUrl() {
  return `${accountPageUrl()}?next=${encodeURIComponent(location.pathname + location.search + location.hash)}`;
}
function verificationUrl() {
  return `${accountPageUrl()}?mode=pending&next=${encodeURIComponent(location.pathname + location.search + location.hash)}`;
}
function accountDestination() {
  const desired = new URLSearchParams(location.search).get('next');
  if (desired) {
    try {
      const url = new URL(desired, location.origin);
      if (url.origin === location.origin && /^\/(?:index\.html|pages\/(?:dashboard|admin|modules|quiz|exams|simulator|mindmaps|flashcards|resources|glossary|fiche-generator|settings)\.html)?$/.test(url.pathname)) return url.pathname + url.search + url.hash;
    } catch { /* Use the dashboard for malformed or external return URLs. */ }
  }
  return '/pages/dashboard.html';
}
async function accountRequest(endpoint, body) {
  let response;
  try {
    response = await fetch(endpoint, {
      method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json', 'X-ScienceEdu-Request': '1', ...(AccountManager.user ? { 'X-ScienceEdu-User': AccountManager.user.id } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(12000)
    });
  } catch { throw new Error('تعذر الاتصال بالخدمة. تحقق من اتصالك ثم حاول مرة أخرى.'); }
  let result;
  try { result = await response.json(); }
  catch { throw new Error('خدمة الحسابات غير متاحة الآن. حاول مرة أخرى لاحقاً.'); }
  if (!response.ok) {
    if (result.code === 'EMAIL_VERIFICATION_REQUIRED') location.replace(verificationUrl());
    if (result.code === 'ACCOUNT_CHANGED' || response.status === 401 && !endpoint.startsWith('/api/auth/')) location.replace(signInUrl());
    const unavailableCatalog = response.status === 404 && ['/api/exams', '/api/quizzes/catalog', '/api/quizzes/pause', '/api/quizzes/resume'].includes(endpoint);
    const message = unavailableCatalog
      ? AccountManager.user?.isAdmin
        ? 'تحديثات الأسئلة والامتحانات لم تُفعّل بعد. أعد تشغيل خادم المنصة ثم أعد المحاولة.'
        : 'خدمة الأسئلة والامتحانات غير متاحة حالياً. أعد المحاولة لاحقاً، أو تواصل مع إدارة المنصة إذا استمر المشكل.'
      : result.error || 'تعذر إتمام الطلب.';
    throw Object.assign(new Error(message), { status: response.status, code: result.code, retryAfter: Number(response.headers.get('retry-after')) || 0 });
  }
  // Admin detail responses describe the selected learner, rather than the signed-in user.
  const adminUserDetail = AccountManager.user?.isAdmin && endpoint.split('?')[0] === '/api/admin/users/detail';
  if (!adminUserDetail && !endpoint.startsWith('/api/auth/') && endpoint !== '/api/session' && result.user && AccountManager.user && result.user.id !== AccountManager.user.id) {
    location.replace(signInUrl()); throw new Error('تغير الحساب. سجل الدخول مرة أخرى.');
  }
  return result;
}

function acceptLearningPayload(result) {
  if (result.progress) learningProgress = result.progress;
  if (result.review) learningReview = result.review;
  emitLearningProgress();
}

function emitLearningProgress() {
  window.dispatchEvent(new CustomEvent('learning-progress', { detail: ProgressManager.getData() }));
}
function setProgressSaveState(state) {
  document.querySelectorAll('[data-save-status]').forEach(element => {
    const text = element.querySelector('[data-save-message]') || element;
    text.textContent = state;
    element.setAttribute('role', 'status');
  });
  document.querySelectorAll('[data-retry-saves]').forEach(button => button.hidden = !unsavedLearningEvents.length || progressPending > 0);
}

const AccountManager = {
  user: null,
  verification: null,
  totals: {},
  ready: null,
  requireUser() {
    if (AccountManager.user?.emailVerified) return true;
    if (AccountManager.user) { location.assign(verificationUrl()); return false; }
    location.assign(signInUrl());
    return false;
  },
  async refresh() {
    if (progressPending || progressRefresh || !AccountManager.user?.emailVerified) return;
    progressRefresh = accountRequest('/api/progress');
    try {
      const result = await progressRefresh;
      if (result.user.id !== AccountManager.user?.id) { location.replace(signInUrl()); return; }
      // A local write may have started while this GET was in flight.
      if (!progressPending) {
        acceptLearningPayload(result);
      }
    } catch (error) {
      if (error.status === 401) location.replace(signInUrl());
      else setProgressSaveState('تعذر تحديث التقدم. أعد المحاولة.');
    } finally { progressRefresh = null; }
  },
  async logout(button) {
    const label = button?.querySelector('[data-logout-label]');
    if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
    if (label) label.textContent = 'جارٍ تسجيل الخروج...';
    try {
      await progressQueue;
      await accountRequest('/api/auth/logout', {});
      AccountManager.user = null;
      learningProgress = structuredClone(DEFAULT_LEARNING_PROGRESS);
      location.replace('/index.html');
    } catch (error) {
      if (typeof showToast === 'function') showToast(error.message);
      if (button) { button.disabled = false; button.removeAttribute('aria-busy'); }
      if (label) label.textContent = 'تسجيل الخروج';
    }
  }
};

const ProgressManager = {
  getData: () => structuredClone(learningProgress),
  getReview: () => structuredClone(learningReview),
  async sendEvent(event) {
    await AccountManager.ready;
    if (!AccountManager.requireUser()) return false;
    const payload = { ...event, operationId: event.operationId || crypto.randomUUID() };
    if (!unsavedLearningEvents.some(item => item.operationId === payload.operationId)) {
      if (unsavedLearningEvents.length >= 200) { showToast('احفظ الأنشطة المعلقة قبل المتابعة.'); return false; }
      unsavedLearningEvents.push(payload); persistLearningOutbox();
    }
    progressPending++;
    setProgressSaveState('جارٍ حفظ التقدم...');
    // Queue events rather than replacing a whole profile, preserving other tabs' changes.
    const save = progressQueue.then(async () => {
      try {
        let result;
        try { result = await accountRequest('/api/progress', payload); }
        catch (error) {
          // Retrying the same operation ID cannot record a quiz attempt twice.
          if (error.status) throw error;
          result = await accountRequest('/api/progress', payload);
        }
        unsavedLearningEvents = unsavedLearningEvents.filter(item => item.operationId !== payload.operationId);
        persistLearningOutbox();
        acceptLearningPayload(result);
        progressSaveFailed = false;
        return true;
      } catch (error) {
        if (error.status === 401) location.replace(signInUrl());
        if (typeof showToast === 'function') showToast(`لم يُحفظ هذا التقدم. ${error.message}`);
        progressSaveFailed = true;
        if (error.status >= 400 && error.status < 500 && ![401,429].includes(error.status) && error.code !== 'ACCOUNT_CHANGED') {
          unsavedLearningEvents = unsavedLearningEvents.filter(item => item.operationId !== payload.operationId); persistLearningOutbox();
        }
        setProgressSaveState('لم يُحفظ التقدم. حاول مرة أخرى.');
        return false;
      } finally {
        progressPending--;
        if (!progressPending) setProgressSaveState(unsavedLearningEvents.length ? 'أنشطة غير محفوظة. أعد محاولة الحفظ.' : progressSaveFailed ? 'تعذر حفظ النشاط.' : 'تم حفظ التقدم');
      }
    });
    progressQueue = save;
    return save;
  },
  setModuleCompleted: (id, completed) => ProgressManager.sendEvent({ type: 'module', id, completed }),
  markModuleCompleted: id => ProgressManager.setModuleCompleted(id, true),
  recordSimulatorScenario: id => ProgressManager.sendEvent({ type: 'simulator', id }),
  recordFlashcard: (id, known) => ProgressManager.sendEvent({ type: 'flashcard', id, known }),
  recordMindmap: id => ProgressManager.sendEvent({ type: 'mindmap', id }),
  recordModuleVisit: id => ProgressManager.sendEvent({ type: 'visit-module', id })
};

async function retryLearningSaves() {
  if (progressPending) return;
  for (const event of [...unsavedLearningEvents]) if (!await ProgressManager.sendEvent(event)) break;
}

function renderAccountControls() {
  const actions = document.querySelector('.topbar-actions');
  if (!actions || !AccountManager.user) return;
  const link = document.createElement('a');
  link.className = 'account-menu-link';
  link.href = window.location.pathname.includes('/pages/') ? 'settings.html' : 'pages/settings.html';
  link.textContent = AccountManager.user.name;
  link.title = 'إعدادات الحساب';
  actions.prepend(link);
  if (AccountManager.user.isAdmin) {
    const adminLink = document.createElement('a');
    adminLink.className = 'account-menu-link admin-pill-link';
    adminLink.href = window.location.pathname.includes('/pages/') ? 'admin.html' : 'pages/admin.html';
    adminLink.textContent = 'لوحة الإدارة ⚙️';
    adminLink.title = 'لوحة التحكم والإدارة';
    actions.prepend(adminLink);
  }
  const main = document.querySelector('main');
  if (main && !main.classList.contains('admin-wrapper') && !main.querySelector('.learning-save-status')) {
    const status = document.createElement('div'); status.className = 'learning-save-status'; status.dataset.saveStatus = ''; status.setAttribute('aria-live', 'polite');
    const message = document.createElement('span'); message.dataset.saveMessage = '';
    const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'btn btn-outline btn-sm'; retry.dataset.retrySaves = ''; retry.textContent = 'إعادة الحفظ'; retry.hidden = true; retry.onclick = retryLearningSaves;
    status.append(message, retry); main.prepend(status);
  }
  const bottom = document.querySelector('.sidebar-bottom');
  if (bottom) {
    const icon = paths => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
    const prefix = window.location.pathname.includes('/pages/') ? '' : 'pages/';
    const panel = document.createElement('div');
    panel.className = 'sidebar-account';
    const profile = document.createElement('a');
    profile.className = 'sidebar-profile'; profile.href = prefix + 'settings.html'; profile.title = 'عرض إعدادات الحساب';
    profile.innerHTML = '<span class="sidebar-avatar" aria-hidden="true"></span><span class="sidebar-profile-copy"><strong></strong><small></small></span>';
    profile.querySelector('.sidebar-avatar').textContent = [...(AccountManager.user.name || 'م').trim()][0] || 'م';
    profile.querySelector('strong').textContent = AccountManager.user.name;
    profile.querySelector('small').textContent = AccountManager.user.isAdmin ? 'مدير المنصة' : 'حساب المتعلم';
    panel.append(profile);
    const addLink = (page, label, paths) => {
      const item = document.createElement('a'); item.href = prefix + page; item.className = 'sidebar-account-action';
      item.innerHTML = icon(paths) + '<span></span>'; item.querySelector('span').textContent = label;
      if (location.pathname.endsWith('/' + page)) item.setAttribute('aria-current', 'page');
      panel.append(item);
    };
    if (AccountManager.user.isAdmin && !location.pathname.endsWith('/admin.html')) {
      addLink('admin.html', 'لوحة الإدارة', '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>');
    }
    addLink('settings.html', 'إعدادات الحساب', '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>');
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'logout-button sidebar-account-action';
    button.innerHTML = icon('<path d="M9 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4M9 12h12m-4-4 4 4-4 4"/>') + '<span data-logout-label>تسجيل الخروج</span>';
    button.onclick = () => AccountManager.logout(button);
    panel.append(button);
    bottom.querySelector('.sidebar-account')?.remove();
    bottom.prepend(panel);
  }
}

AccountManager.ready = new Promise(resolve => document.addEventListener('DOMContentLoaded', async () => {
  try {
    const result = await accountRequest('/api/session');
    AccountManager.user = result.user;
    if (!result.user) {
      if (!isAccountPage()) location.replace(signInUrl());
      else document.documentElement.dataset.auth = 'guest';
      return;
    }
    if (!result.user.emailVerified) {
      AccountManager.verification = result.verification;
      if (!isAccountPage()) location.replace(verificationUrl());
      else {
        document.documentElement.dataset.auth = 'verification';
        if (!publicAccountFlow() && typeof showSignupVerification === 'function') showSignupVerification(result.user,result.verification);
      }
      return;
    }
    AccountManager.totals = result.totals;
    learningProgress = result.progress;
    learningReview = result.review || learningReview;
    if (isAccountPage()) { if (!publicAccountFlow()) location.replace(accountDestination()); else document.documentElement.dataset.auth = 'ready'; return; }
    try { const pending = JSON.parse(localStorage.getItem(outboxKey()) || '[]'); unsavedLearningEvents = Array.isArray(pending) ? pending.filter(item => item && typeof item === 'object' && typeof item.operationId === 'string').slice(0,200) : []; } catch { unsavedLearningEvents = []; }
    renderAccountControls();
    emitLearningProgress();
    document.documentElement.dataset.auth = 'ready';
  } catch (error) {
    document.documentElement.dataset.auth = 'error';
    if (isAccountPage()) {
      const status = document.getElementById('accountError');
      if (status) { status.textContent = error.message; status.hidden = false; }
    } else {
      const notice = document.createElement('div');
      notice.className = 'account-connection-error';
      const message = document.createElement('p'); message.textContent = error.message;
      const retry = document.createElement('button'); retry.className = 'btn btn-primary'; retry.textContent = 'إعادة المحاولة'; retry.onclick = () => location.reload();
      notice.append(message, retry);
      document.querySelector('main')?.before(notice);
    }
  } finally { resolve(); if (AccountManager.user && !isAccountPage() && unsavedLearningEvents.length) retryLearningSaves(); }
}, { once: true }));

window.addEventListener('pageshow', event => { if (event.persisted) AccountManager.refresh(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) AccountManager.refresh(); });
// A visible dashboard follows progress saved from another tab or device.
setInterval(() => { if (!document.hidden) AccountManager.refresh(); }, 15000);
window.addEventListener('beforeunload', event => {
  if (progressPending) { event.preventDefault(); event.returnValue = ''; }
});
window.addEventListener('online', retryLearningSaves);
