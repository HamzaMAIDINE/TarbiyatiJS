/* The public landing page remains usable without an account, API, or JavaScript. */
async function personalizeLandingLinks() {
  try {
    const response = await fetch('/api/session', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!response.ok) return;
    const session = await response.json();
    if (!session.user) return;
    document.querySelectorAll('[data-account-link], [data-start-link]').forEach(link => {
      link.href = session.user.emailVerified ? 'pages/dashboard.html' : 'pages/account.html?mode=pending';
      link.textContent = session.user.emailVerified ? 'انتقل إلى مساحة تعلمك ←' : 'أكمل تأكيد بريدك ←';
    });
  } catch { /* Public content and ordinary account links work without the API. */ }
}
personalizeLandingLinks();
