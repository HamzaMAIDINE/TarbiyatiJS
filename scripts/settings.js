function settingsMessage(text, error = false) {
  const message = document.getElementById('settingsMessage'); message.textContent = text;
  message.setAttribute('role', error ? 'alert' : 'status');
}
async function loadAccountSessions() {
  const result = await accountRequest('/api/auth/sessions'); const list = document.getElementById('sessionList'); list.replaceChildren();
  result.sessions.forEach(session => {
    const row = document.createElement('div'); row.className = 'session-row';
    const title = document.createElement('strong'); title.textContent = session.current ? 'هذا المتصفح' : 'جلسة أخرى';
    const details = document.createElement('p'); details.textContent = `${new Date(session.createdAt).toLocaleString('ar-MA')} · ${session.device}`;
    row.append(title,details);
    if (!session.current) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-outline btn-sm'; button.textContent = 'إنهاء الجلسة';
      button.onclick = async () => { button.disabled = true; try { const data = await accountRequest('/api/auth/revoke-session',{id:session.id}); settingsMessage(data.message); await loadAccountSessions(); } catch (error) { settingsMessage(error.message,true); button.disabled = false; } }; row.appendChild(button);
    }
    list.appendChild(row);
  });
}
document.addEventListener('DOMContentLoaded',async () => {
  await AccountManager.ready; if (!AccountManager.user) return;
  document.getElementById('settingsName').textContent = AccountManager.user.name;
  document.getElementById('settingsEmail').textContent = AccountManager.user.email;
  document.getElementById('verificationStatus').textContent = AccountManager.user.emailVerified ? '✓ بريدك الإلكتروني مؤكد' : 'بريدك الإلكتروني بانتظار التأكيد';
  document.getElementById('sendVerification').hidden = AccountManager.user.emailVerified;
  document.getElementById('sendVerification').onclick = async event => {
    const button = event.currentTarget; button.disabled = true;
    try { const result = await accountRequest('/api/auth/request-verification',{}); settingsMessage(result.message); }
    catch (error) { settingsMessage(error.message,true); } finally { button.disabled = false; }
  };
  document.getElementById('changePasswordForm').onsubmit = async event => {
    event.preventDefault(); const form = event.currentTarget;
    const password = document.getElementById('newPassword').value;
    if (password !== document.getElementById('confirmPassword').value) { settingsMessage('كلمتا المرور غير متطابقتين.',true); return; }
    const button = form.querySelector('button'); button.disabled = true;
    try { const result = await accountRequest('/api/auth/change-password',{currentPassword:document.getElementById('currentPassword').value,password}); form.reset(); settingsMessage(result.message); await loadAccountSessions(); }
    catch (error) { settingsMessage(error.message,true); } finally { button.disabled = false; }
  };
  document.getElementById('revokeOtherSessions').onclick = async event => {
    const button = event.currentTarget; button.disabled = true;
    try { const result = await accountRequest('/api/auth/revoke-others',{}); settingsMessage(result.message); await loadAccountSessions(); }
    catch (error) { settingsMessage(error.message,true); } finally { button.disabled = false; }
  };
  try { await loadAccountSessions(); } catch (error) { settingsMessage(error.message,true); }
});
