let accountMode = 'login';
let verificationResendAt = 0;
let verificationChecking = false;
let verificationResending = false;
let verificationSubmitting = false;

function setAccountMode(mode) {
  accountMode = mode;
  const registration = mode === 'register', recovery = mode === 'forgot', reset = mode === 'reset', verification = mode === 'verify', pending = mode === 'pending';
  document.querySelectorAll('[data-account-mode]').forEach(button => {
    const active = button.dataset.accountMode === mode; button.classList.toggle('active',active); button.setAttribute('aria-pressed',String(active));
  });
  document.getElementById('accountForm').hidden = pending;
  document.getElementById('signupVerification').hidden = !pending;
  document.getElementById('accountNameField').hidden = !registration;
  document.getElementById('accountName').required = registration;
  document.getElementById('accountEmailField').hidden = reset || verification || pending;
  document.getElementById('accountEmail').required = !reset && !verification && !pending;
  document.getElementById('accountPasswordField').hidden = recovery || verification || pending;
  document.getElementById('accountPassword').required = !recovery && !verification && !pending;
  document.getElementById('forgotPasswordLink').hidden = mode !== 'login';
  document.querySelector('.account-tabs').hidden = reset || verification || pending;
  const password = document.getElementById('accountPassword');
  password.autocomplete = registration || reset ? 'new-password' : 'current-password'; password.minLength = registration || reset ? 10 : 1;
  document.getElementById('passwordHint').hidden = !registration && !reset;
  document.getElementById('accountSubmit').textContent = registration ? 'أنشئ حسابك وأكد بريدك' : recovery ? 'أرسل رابط الاستعادة' : reset ? 'حفظ كلمة المرور الجديدة' : verification ? 'تأكيد البريد' : 'تسجيل الدخول';
  document.getElementById('account-form-heading').textContent = reset ? 'اختر كلمة مرور جديدة' : recovery ? 'استعادة كلمة المرور' : verification || pending ? 'تأكيد البريد الإلكتروني' : 'أهلاً بك في تربيتي';
  document.getElementById('accountFormIntro').textContent = registration ? 'املأ بياناتك، ثم أكد بريدك الإلكتروني لتفعيل الحساب.' : pending ? 'تبقت خطوة واحدة لتبدأ التعلم.' : verification ? 'نتحقق من رابط تأكيد البريد...' : 'سجل الدخول أو أنشئ حساباً لمتابعة التعلم.';
  const steps = document.querySelector('.signup-progress'); steps.hidden = !registration && !pending && !verification;
  document.querySelectorAll('[data-signup-step]').forEach(step => {
    const current = registration ? 1 : 2; const number = Number(step.dataset.signupStep);
    if (number === current) step.setAttribute('aria-current','step'); else step.removeAttribute('aria-current');
    step.classList.toggle('complete',number < current);
  });
  document.getElementById('accountError').hidden = true; document.getElementById('accountSuccess').hidden = true;
  document.getElementById('verifiedContinue').hidden = true;
}
function accountFlowUrl(mode) {
  const url = new URL(location.href); url.searchParams.set('mode',mode); url.hash = '';
  history.replaceState(null,'',url.pathname + url.search);
}
function updateVerificationCooldown() {
  const remaining = Math.max(0,Math.ceil((verificationResendAt - Date.now()) / 1000));
  const button = document.getElementById('verificationResend'); button.disabled = verificationResending || remaining > 0;
  button.textContent = verificationResending ? 'جارٍ الإرسال...' : remaining ? 'إعادة إرسال الرمز (' + remaining + ' ث)' : 'إعادة إرسال الرمز';
}
function updateVerificationDelivery(state = {}) {
  const descriptions = {
    pending: 'جارٍ إرسال رمز التأكيد إلى بريدك الإلكتروني:',
    retrying: 'تأخر إرسال البريد. نحاول مجدداً تلقائياً؛ يمكنك طلب رمز جديد بعد انتهاء المهلة:',
    failed: 'تعذر إرسال رمز التأكيد. اطلب رمزاً جديداً أو تواصل مع إدارة المنصة:',
    expired: 'انتهت صلاحية رمز التأكيد. اطلب رمزاً جديداً للمتابعة:',
    sent: 'أُرسل رمز التأكيد إلى بريدك الإلكتروني. تحقق أيضاً من مجلد الرسائل غير المرغوب فيها:'
  };
  document.getElementById('verificationDescription').textContent = state.delivery === 'preview'
    ? 'رمز التأكيد محفوظ في معاينة البريد المحلية لهذا الحساب:' : state.delivery === 'unavailable'
      ? 'خدمة البريد غير متاحة مؤقتاً. حاول لاحقاً أو تواصل مع إدارة المنصة:' : descriptions[state.deliveryStatus] || descriptions.pending;
}
function showSignupVerification(user,state = {}) {
  setAccountMode('pending'); AccountManager.user = user; AccountManager.verification = state;
  document.documentElement.dataset.auth = 'verification';
  document.getElementById('verificationEmail').textContent = user.email;
  updateVerificationDelivery(state);
  verificationResendAt = Date.now() + (state.retryAfter || 0) * 1000; updateVerificationCooldown();
  document.getElementById('accountPassword').value = '';
  document.getElementById('verificationCode').value = '';
  document.getElementById('verificationNotice').textContent = '';
  accountFlowUrl('pending');
  document.getElementById('verificationHeading').focus({preventScroll:true});
  document.getElementById('signupVerification').scrollIntoView({behavior:'smooth',block:'nearest'});
}
async function checkSignupVerification(manual = false) {
  if (verificationChecking || accountMode !== 'pending') return;
  verificationChecking = true; const button = document.getElementById('verificationCheck'); button.disabled = true;
  try {
    const result = await accountRequest('/api/session'); AccountManager.user = result.user;
    if (!result.user) { setAccountMode('login'); accountFlowUrl('login'); document.documentElement.dataset.auth = 'guest'; return; }
    if (result.user.emailVerified) { location.replace(accountDestination()); return; }
    verificationResendAt = Date.now() + (result.verification?.retryAfter || 0) * 1000; updateVerificationCooldown();
    updateVerificationDelivery(result.verification);
    if (manual) document.getElementById('verificationNotice').textContent = 'لم يُؤكد البريد بعد. أدخل الرمز المكون من 6 أرقام الموجود في رسالة التأكيد.';
  } catch (error) {
    if (manual) document.getElementById('verificationNotice').textContent = error.message;
  } finally { verificationChecking = false; button.disabled = false; }
}
async function resendSignupVerification() {
  if (verificationResending || accountMode !== 'pending') return;
  verificationResending = true; updateVerificationCooldown();
  try {
    const result = await accountRequest('/api/auth/request-verification',{});
    verificationResendAt = Date.now() + (result.verification?.retryAfter || 0) * 1000;
    updateVerificationDelivery(result.verification);
    document.getElementById('verificationCode').value = '';
    document.getElementById('accountError').hidden = true;
    document.getElementById('verificationNotice').textContent = result.message;
  } catch (error) {
    if (error.retryAfter) verificationResendAt = Date.now() + error.retryAfter * 1000;
    document.getElementById('verificationNotice').textContent = error.message;
  } finally { verificationResending = false; updateVerificationCooldown(); }
}
const accountToken = new URLSearchParams(location.hash.slice(1)).get('token');
document.getElementById('verificationCode').addEventListener('input', event => {
  // Accept Arabic and Persian keyboards while submitting a six-digit ASCII code.
  event.target.value = event.target.value.replace(/[\u0660-\u0669\u06f0-\u06f9]/g, digit =>
    String(digit.charCodeAt(0) - (digit >= '\u06f0' ? 0x06f0 : 0x0660)));
});
document.getElementById('verificationCodeForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (verificationSubmitting || accountMode !== 'pending' || !event.currentTarget.reportValidity()) return;
  verificationSubmitting = true;
  const button = document.getElementById('verificationSubmit'), error = document.getElementById('accountError');
  button.disabled = true; button.textContent = 'جارٍ تأكيد البريد...'; error.hidden = true;
  document.getElementById('verificationNotice').textContent = '';
  try {
    await accountRequest('/api/auth/verify-email', { code: document.getElementById('verificationCode').value });
    await checkSignupVerification(true);
  } catch (exception) {
    error.textContent = exception.message; error.hidden = false;
    document.getElementById('verificationCode').focus();
  } finally {
    verificationSubmitting = false; button.disabled = false; button.textContent = 'تأكيد البريد ومتابعة التعلم';
  }
});
document.getElementById('forgotPasswordLink').onclick = () => setAccountMode('forgot');
document.getElementById('verificationCheck').onclick = () => checkSignupVerification(true);
document.getElementById('verificationResend').onclick = resendSignupVerification;
document.getElementById('verificationOtherAccount').onclick = async event => {
  const button = event.currentTarget; button.disabled = true;
  try {
    await accountRequest('/api/auth/logout',{}); AccountManager.user = null; setAccountMode('login'); accountFlowUrl('login');
    document.getElementById('accountEmail').value = ''; document.getElementById('accountPassword').value = ''; document.documentElement.dataset.auth = 'guest';
  } catch (error) { document.getElementById('verificationNotice').textContent = error.message; } finally { button.disabled = false; }
};
document.getElementById('passwordVisibility').onclick = event => {
  const input = document.getElementById('accountPassword'), visible = input.type === 'password'; input.type = visible ? 'text' : 'password';
  event.currentTarget.textContent = visible ? 'إخفاء' : 'إظهار'; event.currentTarget.setAttribute('aria-pressed',String(visible));
};
document.getElementById('accountForm').addEventListener('submit',async event => {
  event.preventDefault(); const form = event.currentTarget; if (!form.reportValidity()) return;
  const submittedMode = accountMode; const submit = document.getElementById('accountSubmit'), error = document.getElementById('accountError');
  submit.disabled = true; error.hidden = true; document.querySelectorAll('[data-account-mode]').forEach(button => button.disabled = true);
  const label = submit.textContent; submit.textContent = 'جارٍ المتابعة...';
  try {
    const endpoint = {forgot:'forgot-password',reset:'reset-password',verify:'verify-email'}[submittedMode] || submittedMode;
    const result = await accountRequest('/api/auth/' + endpoint,{
      name:document.getElementById('accountName').value,email:document.getElementById('accountEmail').value,
      password:document.getElementById('accountPassword').value,token:accountToken
    });
    if (submittedMode === 'forgot') {
      document.getElementById('accountSuccess').textContent = result.message; document.getElementById('accountSuccess').hidden = false;
      submit.textContent = label;
    } else if (submittedMode === 'verify') {
      const session = await accountRequest('/api/session'); AccountManager.user = session.user;
      if (session.user?.emailVerified) { location.replace(accountDestination()); return; }
      if (session.user) showSignupVerification(session.user,session.verification);
      else { setAccountMode('login'); accountFlowUrl('login'); }
      document.getElementById('accountSuccess').textContent = result.message + (session.user ? '' : ' سجل الدخول لمتابعة التعلم.');
      document.getElementById('accountSuccess').hidden = false;
    } else if (submittedMode === 'reset') {
      AccountManager.user = null; document.getElementById('accountPassword').value = '';
      setAccountMode('login'); accountFlowUrl('login'); document.documentElement.dataset.auth = 'guest';
      document.getElementById('accountSuccess').textContent = result.message; document.getElementById('accountSuccess').hidden = false;
    } else {
      AccountManager.user = result.user;
      if (result.user.emailVerified) { location.replace(accountDestination()); return; }
      showSignupVerification(result.user,result.verification);
    }
  } catch (exception) {
    if (submittedMode === 'verify') {
      if (AccountManager.user && !AccountManager.user.emailVerified) {
        const session = await accountRequest('/api/session').catch(() => null);
        showSignupVerification(session?.user || AccountManager.user,session?.verification || AccountManager.verification || {});
      }
      else { setAccountMode('login'); accountFlowUrl('login'); }
    }
    error.textContent = exception.message; error.hidden = false;
    if (accountMode === submittedMode) submit.textContent = label;
  } finally {
    submit.disabled = false; document.querySelectorAll('[data-account-mode]').forEach(button => button.disabled = false);
  }
});
const initialAccountMode = new URLSearchParams(location.search).get('mode');
if (['register','forgot','reset','verify','pending'].includes(initialAccountMode)) setAccountMode(initialAccountMode);
document.addEventListener('DOMContentLoaded',async () => {
  await AccountManager.ready;
  if (initialAccountMode === 'verify') document.getElementById('accountForm').requestSubmit();
  else if (initialAccountMode === 'pending' && !AccountManager.user) { setAccountMode('login'); accountFlowUrl('login'); }
});
setInterval(() => { if (accountMode === 'pending') updateVerificationCooldown(); },1000);
setInterval(() => { if (!document.hidden && accountMode === 'pending') checkSignupVerification(); },5000);
document.addEventListener('visibilitychange',() => { if (!document.hidden && accountMode === 'pending') checkSignupVerification(); });

