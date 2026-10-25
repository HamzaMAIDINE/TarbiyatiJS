/** Admin workspace: account management, delivery monitoring, and learning summaries. */
'use strict';

const ADMIN_TABS = {
  overview: 'نظرة عامة', users: 'المتعلمون والحسابات',
  mail: 'البريد الإلكتروني', analytics: 'تحليلات التعلم'
};
let currentTab = 'overview';
let currentPage = 1;
let searchDebounceTimer;
let currentAdminUser;
let overviewRequest;
let usersRequestId = 0;
let mailRequestId = 0;
let detailRequestId = 0;
let modalReturnFocus;
let modalInertStates = [];

async function initAdminPanel() {
  await AccountManager.ready;
  if (!AccountManager.user) return;
  if (!AccountManager.user.isAdmin) { location.replace('/pages/dashboard.html'); return; }
  currentAdminUser = AccountManager.user;
  setText('adminNameDisplay', currentAdminUser.name || 'المدير');
  setText('adminEmailDisplay', currentAdminUser.email);
  setupEventListeners();
  await switchAdminTab(Object.hasOwn(ADMIN_TABS, location.hash.slice(1)) ? location.hash.slice(1) : 'overview');
}

function setupEventListeners() {
  document.getElementById('btnRefreshData').addEventListener('click', refreshCurrentTab);
  document.getElementById('btnRetryMailTab').addEventListener('click', event => retryFailedMail(event.currentTarget));
  document.getElementById('btnViewAllUsers').addEventListener('click', () => switchAdminTab('users'));
  document.querySelectorAll('[data-admin-tab], [data-admin-nav]').forEach(button => {
    button.addEventListener('click', () => {
      switchAdminTab(button.dataset.adminTab || button.dataset.adminNav);
      if (document.body.classList.contains('menu-open')) closeMobileMenu();
    });
  });
  document.querySelector('.admin-tabs').addEventListener('keydown', event => {
    const tabs = [...document.querySelectorAll('[data-admin-tab]')];
    const index = tabs.indexOf(document.activeElement);
    if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 :
      (index + (event.key === 'ArrowLeft' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].focus();
    switchAdminTab(tabs[next].dataset.adminTab);
  });
  document.querySelectorAll('[data-followup]').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.followup === 'users') document.getElementById('userFilterSelect').value = 'unverified';
    else document.getElementById('mailFilterSelect').value = 'failed';
    currentPage = 1;
    switchAdminTab(button.dataset.followup);
  }));
  document.getElementById('userSearchInput').addEventListener('input', () => {
    clearTimeout(searchDebounceTimer);
    // Invalidate an older response as soon as the query changes.
    usersRequestId++;
    searchDebounceTimer = setTimeout(() => loadUsersPage(1), 350);
  });
  document.getElementById('userFilterSelect').addEventListener('change', () => {
    clearTimeout(searchDebounceTimer); loadUsersPage(1);
  });
  document.getElementById('btnClearUserFilters').addEventListener('click', () => {
    clearTimeout(searchDebounceTimer);
    document.getElementById('userSearchInput').value = '';
    document.getElementById('userFilterSelect').value = 'all';
    loadUsersPage(1);
  });
  document.getElementById('mailFilterSelect').addEventListener('change', loadMailJobs);
  document.getElementById('btnPrevPage').addEventListener('click', () => loadUsersPage(currentPage - 1));
  document.getElementById('btnNextPage').addEventListener('click', () => loadUsersPage(currentPage + 1));
  document.getElementById('btnCloseModal').addEventListener('click', closeUserDetailModal);
  document.getElementById('userDetailModal').addEventListener('click', event => {
    if (event.target.id === 'userDetailModal') closeUserDetailModal();
  });
  document.addEventListener('keydown', event => {
    const modal = document.getElementById('userDetailModal');
    if (modal.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); closeUserDetailModal(); }
    if (event.key !== 'Tab') return;
    const controls = [...modal.querySelectorAll('button, a[href], [tabindex="0"]')].filter(el => !el.disabled && el.getClientRects().length);
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-admin-action]');
    if (!button || button.disabled) return;
    const id = button.dataset.userId;
    if (button.dataset.adminAction === 'view-user') openUserDetailModal(id);
    if (button.dataset.adminAction === 'toggle-verify') toggleUserVerify(id, button.dataset.verify === 'true', button);
    if (button.dataset.adminAction === 'reset-password') triggerPasswordReset(id, button);
    if (button.dataset.adminAction === 'delete-user') deleteUser(id, button.dataset.userName, button);
  });
  window.addEventListener('hashchange', () => {
    const tab = location.hash.slice(1);
    switchAdminTab(Object.hasOwn(ADMIN_TABS, tab) ? tab : 'overview');
  });
}

async function switchAdminTab(tabName) {
  if (!Object.hasOwn(ADMIN_TABS, tabName)) return false;
  currentTab = tabName;
  setText('adminLocation', ADMIN_TABS[tabName]);
  document.querySelectorAll('[data-admin-tab]').forEach(button => {
    const active = button.dataset.adminTab === tabName;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll('[data-admin-nav]').forEach(button => {
    const active = button.dataset.adminNav === tabName;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  document.querySelectorAll('.admin-tab-content').forEach(panel => {
    panel.hidden = panel.id !== 'tab' + tabName[0].toUpperCase() + tabName.slice(1);
  });
  if (location.hash !== '#' + tabName) history.replaceState(null, '', '#' + tabName);
  const requests = [loadOverview()];
  if (tabName === 'users') requests.push(loadUsersPage(currentPage));
  if (tabName === 'mail') requests.push(loadMailJobs());
  const results = await Promise.all(requests);
  return results.every(Boolean);
}

async function refreshCurrentTab() {
  const button = document.getElementById('btnRefreshData');
  await withBusy(button, async () => {
    if (await switchAdminTab(currentTab)) showToast('تم تحديث البيانات بنجاح.');
  });
}

function loadOverview() {
  if (overviewRequest) return overviewRequest;
  overviewRequest = (async () => {
    try {
      const data = await accountRequest('/api/admin/overview');
      const s = data.stats;
      const values = {
        kpiTotalUsers: s.totalUsers, kpiVerifiedUsers: s.verifiedUsers,
        kpiVerifiedPercent: s.verifiedPercent, kpiTotalQuizzes: s.totalQuizzes,
        kpiAvgScore: s.totalQuizzes ? `${s.avgScore}%` : '—',
        kpiMailSent: s.mail.sent, kpiMailPending: s.mail.pending, kpiMailFailed: s.mail.failed,
        kpiActiveSessions: s.activeSessions, kpiTotalDrafts: s.totalDrafts,
        kpiExamAttempts: s.examAttempts, kpiPracticeAttempts: s.practiceAttempts,
        followupUnverified: s.unverifiedUsers, followupFailed: s.mail.failed,
        verificationRate: s.totalUsers ? `${s.verifiedPercent}%` : '—',
        summaryVerified: s.verifiedUsers, summaryUnverified: s.unverifiedUsers,
        mailSummarySent: s.mail.sent, mailSummaryPending: s.mail.pending, mailSummaryFailed: s.mail.failed,
        analyticsAvgScore: s.totalQuizzes ? `${s.avgScore}%` : '—',
        analyticsSessions: s.activeSessions, analyticsDrafts: s.totalDrafts
      };
      Object.entries(values).forEach(([id, value]) => setText(id, value));
      document.getElementById('verificationRing').style.setProperty('--rate', s.verifiedPercent + '%');
      for (const [name, count] of [['exam', s.examAttempts], ['practice', s.practiceAttempts]]) {
        const share = s.totalQuizzes ? Math.round(count / s.totalQuizzes * 100) : 0;
        document.getElementById(name + 'ShareBar').style.width = share + '%';
        setText(name + 'ShareLabel', `${count} محاولة · ${share}%`);
      }
      setText('analyticsNote', s.totalQuizzes ? `إجمالي ${s.totalQuizzes} اختبار مكتمل في جميع أنماط التعلم.` : 'لم تكتمل أي اختبارات بعد. ستظهر المؤشرات هنا بعد أول محاولة مكتملة.');
      const recent = document.getElementById('recentUsersTableBody');
      recent.innerHTML = data.recentUsers.length ? data.recentUsers.map(user => `
        <tr><td>${userIdentity(user)}</td><td class="email-cell">${escapeHtml(user.email)}</td>
        <td>${verificationPill(user.email_verified)}</td><td class="date-cell">${formatDate(user.created_at)}</td>
        <td><button class="btn-action" data-admin-action="view-user" data-user-id="${escapeHtml(user.id)}">عرض التفاصيل</button></td></tr>
      `).join('') : tableState(5, 'لا توجد حسابات بعد', 'ستظهر أحدث الحسابات هنا عند انضمام المتعلمين.');
      document.getElementById('adminNotice').hidden = true;
      markUpdated();
      return true;
    } catch (error) {
      const notice = document.getElementById('adminNotice');
      notice.textContent = 'تعذر تحديث إحصائيات المنصة. البيانات المعروضة قد تكون قديمة. ' + error.message;
      notice.hidden = false;
      return false;
    } finally {
      overviewRequest = null;
    }
  })();
  return overviewRequest;
}

async function loadUsersPage(page = 1) {
  const requestId = ++usersRequestId;
  currentPage = Math.max(1, page);
  const tbody = document.getElementById('usersTableBody');
  const table = tbody.closest('.table-responsive');
  table.setAttribute('aria-busy', 'true');
  tbody.innerHTML = tableState(7, 'جارٍ تحميل المتعلمين...');
  document.getElementById('btnPrevPage').disabled = true;
  document.getElementById('btnNextPage').disabled = true;
  try {
    const params = new URLSearchParams({ page: currentPage, limit: 15,
      search: document.getElementById('userSearchInput').value.trim(),
      filter: document.getElementById('userFilterSelect').value });
    const data = await accountRequest('/api/admin/users?' + params);
    if (requestId !== usersRequestId) return false;
    if (data.pagination.page > data.pagination.totalPages) return loadUsersPage(data.pagination.totalPages);
    currentPage = data.pagination.page;
    setText('userCountSummary', `إجمالي النتائج: ${data.pagination.total} متعلم`);
    setText('paginationInfo', `صفحة ${currentPage} من ${data.pagination.totalPages}`);
    document.getElementById('btnPrevPage').disabled = currentPage <= 1;
    document.getElementById('btnNextPage').disabled = currentPage >= data.pagination.totalPages;
    tbody.innerHTML = data.users.length ? data.users.map(user => `
      <tr><td>${userIdentity(user)}</td><td class="email-cell">${escapeHtml(user.email)}</td>
      <td>${verificationPill(user.email_verified)}</td><td class="date-cell">${formatDate(user.created_at)}</td>
      <td>${user.quizzes_taken || 0}</td><td>${user.avg_score != null ? user.avg_score + '%' : '—'}</td>
      <td><div class="actions-group">
        <button class="btn-action" data-admin-action="view-user" data-user-id="${escapeHtml(user.id)}">التفاصيل</button>
        <button class="btn-action" data-admin-action="toggle-verify" data-user-id="${escapeHtml(user.id)}" data-verify="${!user.email_verified}">${user.email_verified ? 'إلغاء التأكيد' : 'تأكيد الحساب'}</button>
        <button class="btn-action" data-admin-action="reset-password" data-user-id="${escapeHtml(user.id)}">استعادة كلمة المرور</button>
        ${user.id !== currentAdminUser.id ? `<button class="btn-action danger" data-admin-action="delete-user" data-user-id="${escapeHtml(user.id)}" data-user-name="${escapeHtml(user.name)}">حذف الحساب</button>` : ''}
      </div></td></tr>
    `).join('') : tableState(7, 'لا توجد نتائج مطابقة', 'جرّب اسماً آخر أو امسح الفلاتر لعرض جميع الحسابات.');
    markUpdated();
    return true;
  } catch (error) {
    if (requestId === usersRequestId) {
      tbody.innerHTML = tableState(7, 'تعذر تحميل المتعلمين', 'استخدم تحديث البيانات للمحاولة مجدداً.');
      setText('userCountSummary', 'تعذر تحميل النتائج.');
      setText('paginationInfo', 'البيانات غير متاحة');
    }
    return false;
  } finally {
    if (requestId === usersRequestId) table.removeAttribute('aria-busy');
  }
}

async function toggleUserVerify(id, verify, button) {
  await withBusy(button, async () => {
    try {
      const result = await accountRequest('/api/admin/users/' + (verify ? 'verify' : 'unverify'), { id });
      showToast(result.message || 'تم تحديث حالة الحساب.');
      await Promise.all([loadUsersPage(currentPage), loadOverview()]);
    } catch (error) { showToast(error.message); }
  });
}

async function triggerPasswordReset(id, button) {
  if (!confirm('إرسال رابط استعادة كلمة المرور إلى بريد هذا المتعلم؟')) return;
  await withBusy(button, async () => {
    try {
      const result = await accountRequest('/api/admin/users/reset-password', { id });
      showToast(result.message);
      await loadOverview();
    } catch (error) { showToast(error.message); }
  });
}

async function deleteUser(id, name, button) {
  if (!confirm(`حذف حساب «${name}»؟ سيُحذف تقدمه واختباراته نهائياً ولا يمكن التراجع عن ذلك.`)) return;
  await withBusy(button, async () => {
    try {
      const result = await accountRequest('/api/admin/users/delete', { id });
      showToast(result.message);
      await Promise.all([loadUsersPage(currentPage), loadOverview()]);
    } catch (error) { showToast(error.message); }
  });
}

async function openUserDetailModal(id) {
  const modal = document.getElementById('userDetailModal');
  const content = document.getElementById('modalUserContent');
  const requestId = ++detailRequestId;
  if (modal.hidden) {
    modalReturnFocus = document.activeElement;
    modalInertStates = [...document.querySelectorAll('main, .site-topbar, .site-sidebar, .site-footer')].map(el => [el, el.inert]);
    modalInertStates.forEach(([el]) => el.inert = true);
  }
  modal.hidden = false;
  document.body.classList.add('admin-modal-open');
  setText('modalUserName', 'تفاصيل المتعلم');
  content.textContent = 'جارٍ تحميل تفاصيل المتعلم...';
  content.setAttribute('aria-busy', 'true');
  document.getElementById('btnCloseModal').focus();
  try {
    const data = await accountRequest('/api/admin/users/detail?id=' + encodeURIComponent(id));
    if (requestId !== detailRequestId || modal.hidden) return;
    const user = data.user, progress = data.progress || {};
    setText('modalUserName', 'ملف المتعلم: ' + user.name);
    content.innerHTML = `
      <dl class="user-detail-grid">
        <div><dt>البريد الإلكتروني</dt><dd><bdi>${escapeHtml(user.email)}</bdi></dd></div>
        <div><dt>حالة الحساب</dt><dd>${verificationPill(user.email_verified)}</dd></div>
        <div><dt>تاريخ الانضمام</dt><dd>${formatDate(user.created_at)}</dd></div>
        <div><dt>الجلسات النشطة</dt><dd>${data.activeSessions.length}</dd></div>
      </dl>
      <h3 class="user-detail-heading">التقدم في التعلم</h3>
      <div class="user-detail-stats"><span class="status-pill verified">مجزوءات مكتملة: ${(progress.completedModules || []).length}</span>
      <span class="status-pill sent">بطاقات متقنة: ${(progress.masteredFlashcards || []).length}</span>
      <span class="status-pill pending">وضعيات منجزة: ${(progress.simulatorCompleted || []).length}</span></div>
      <h3 class="user-detail-heading">آخر محاولات الاختبارات</h3>
      ${data.recentQuizzes.length ? '<ul class="quiz-detail-list">' + data.recentQuizzes.map(quiz => `
        <li><strong>${quiz.mode === 'exam' ? 'محاكاة الامتحان' : 'التدريب الحر'}</strong> · ${quiz.score != null ? quiz.score + '%' : 'غير مكتمل'}
        <small>${formatDate(quiz.created_at)}</small></li>`).join('') + '</ul>' : '<p class="analytics-note">لم يسجل هذا المتعلم أي محاولات بعد.</p>'}
    `;
  } catch (error) {
    if (requestId === detailRequestId) content.textContent = 'تعذر تحميل التفاصيل. أغلق النافذة وحاول مجدداً.';
  } finally {
    if (requestId === detailRequestId) content.removeAttribute('aria-busy');
  }
}

function closeUserDetailModal() {
  const modal = document.getElementById('userDetailModal');
  if (modal.hidden) return;
  detailRequestId++;
  modal.hidden = true;
  document.body.classList.remove('admin-modal-open');
  modalInertStates.forEach(([el, inert]) => el.inert = inert);
  modalInertStates = [];
  if (modalReturnFocus?.isConnected) modalReturnFocus.focus();
  else document.querySelector(`[data-admin-tab="${currentTab}"]`)?.focus();
}

async function loadMailJobs() {
  const requestId = ++mailRequestId;
  const tbody = document.getElementById('mailJobsTableBody');
  const table = tbody.closest('.table-responsive');
  table.setAttribute('aria-busy', 'true');
  tbody.innerHTML = tableState(5, 'جارٍ تحميل الرسائل...');
  try {
    const filter = document.getElementById('mailFilterSelect').value;
    const data = await accountRequest('/api/admin/mail-jobs?status=' + encodeURIComponent(filter));
    if (requestId !== mailRequestId) return false;
    setText('mailCountSummary', `يعرض السجل ${data.jobs.length} رسالة${data.jobs.length === 50 ? ' من أحدث الرسائل المطابقة' : ''}.`);
    const statuses = { sent: 'مرسلة', pending: 'معلقة', failed: 'تعذر إرسالها' };
    tbody.innerHTML = data.jobs.length ? data.jobs.map(job => `
      <tr><td class="email-cell">${escapeHtml(job.recipient)}</td><td><strong>${escapeHtml(job.subject)}</strong></td>
      <td><span class="status-pill ${Object.hasOwn(statuses, job.status) ? job.status : 'pending'}">${statuses[job.status] || 'معلقة'}</span></td>
      <td>${job.attempts}</td><td class="date-cell">${formatDate(job.created_at)}</td></tr>
    `).join('') : tableState(5, 'لا توجد رسائل مطابقة', 'ستظهر الرسائل هنا عند إرسال تأكيدات الحساب أو روابط الاستعادة.');
    markUpdated();
    return true;
  } catch (error) {
    if (requestId === mailRequestId) {
      tbody.innerHTML = tableState(5, 'تعذر تحميل سجل البريد', 'استخدم تحديث البيانات للمحاولة مجدداً.');
      setText('mailCountSummary', 'السجل غير متاح حالياً.');
    }
    return false;
  } finally {
    if (requestId === mailRequestId) table.removeAttribute('aria-busy');
  }
}

async function retryFailedMail(button) {
  await withBusy(button, async () => {
    try {
      const result = await accountRequest('/api/admin/mail-jobs/retry', {});
      showToast(result.message || 'تمت جدولة الرسائل لإعادة الإرسال.');
      await Promise.all([loadOverview(), loadMailJobs()]);
    } catch (error) { showToast(error.message); }
  });
}

async function withBusy(button, action) {
  if (button.disabled) return;
  button.disabled = true; button.setAttribute('aria-busy', 'true');
  try { await action(); }
  finally { button.disabled = false; button.removeAttribute('aria-busy'); }
}

function markUpdated() {
  setText('adminLastUpdated', 'آخر تحديث: ' + new Date().toLocaleTimeString('ar-MA', { hour: '2-digit', minute: '2-digit' }));
}
function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value != null ? value : '—';
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}
function userIdentity(user) {
  const initial = [...(user.name || 'م').trim()][0] || 'م';
  return `<div class="user-cell"><span class="user-avatar" aria-hidden="true">${escapeHtml(initial)}</span><div><strong>${escapeHtml(user.name)}</strong>${user.id === currentAdminUser.id ? '<br><span class="admin-badge">حسابك · المدير</span>' : ''}</div></div>`;
}
function verificationPill(verified) {
  return `<span class="status-pill ${verified ? 'verified' : 'unverified'}">${verified ? 'مؤكد' : 'بانتظار التأكيد'}</span>`;
}
function tableState(columns, title, description = '') {
  return `<tr><td colspan="${columns}" class="table-state"><strong>${escapeHtml(title)}</strong>${escapeHtml(description)}</td></tr>`;
}
function formatDate(timestamp) {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? '—' : escapeHtml(date.toLocaleDateString('ar-MA', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  }));
}

document.addEventListener('DOMContentLoaded', initAdminPanel);
