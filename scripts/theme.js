/* Apply the saved theme before styles paint, including public and account pages. */
function applyTheme(theme) {
  const value = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', value);
  document.documentElement.style.colorScheme = value;
  updateThemeButton(value);
}

function initTheme() {
  let theme = 'light';
  try { theme = localStorage.getItem('edu_theme') || 'light'; } catch { /* Theme switching also works when storage is unavailable. */ }
  applyTheme(theme);
}

function toggleTheme() {
  const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  applyTheme(theme);
  try { localStorage.setItem('edu_theme', theme); } catch { /* Keep the selected theme for this visit. */ }
}

function updateThemeButton(theme) {
  const button = document.getElementById('themeToggleBtn');
  if (!button) return;
  const shape = theme === 'dark'
    ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>'
    : '<path d="M20.9 13.1A9 9 0 0 1 10.9 3.1 9 9 0 1 0 20.9 13.1Z"/>';
  button.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">${shape}</svg>`;
  const label = theme === 'dark' ? 'تفعيل الوضع النهاري' : 'تفعيل الوضع الليلي';
  button.setAttribute('title', label);
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-pressed', String(theme === 'dark'));
}

initTheme();
document.addEventListener('DOMContentLoaded', () => updateThemeButton(document.documentElement.getAttribute('data-theme')));
window.addEventListener('storage', event => { if (event.key === 'edu_theme') applyTheme(event.newValue); });
