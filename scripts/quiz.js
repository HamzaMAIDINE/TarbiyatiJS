let activeQuestions = [];
let currentIndex = 0;
let userAnswers = {};
let isExamMode = false;
let timerInterval = null;
let timerDeadline = null;
let quizAttempt = null;
let quizBusy = false;
let quizCatalogReady = false;
let quizFinished = false;
let pendingQuizStart = null;
let serverClockOffset = 0;
let quizExpiryAttempted = false;
function renderSavedExamLink(sessions) {
  if (!Array.isArray(sessions)) return;
  const session = sessions.find(session => session.status === 'paused') || sessions[0];
  const banner = document.getElementById('quizSavedExam'); banner.hidden = !session;
  if (!session) return;
  document.getElementById('quizSavedExamMessage').textContent = session.status === 'paused'
    ? `امتحان ${session.examId.slice(-4)} متوقف مؤقتاً. إجاباتك ووقتك المتبقي محفوظان؛ يمكنك متابعة التدريب والعودة إليه لاحقاً.`
    : `لديك امتحان ${session.examId.slice(-4)} جارٍ. يمكنك العودة إليه وإيقافه مؤقتاً لحفظ الوقت المتبقي.`;
  document.getElementById('quizSavedExamLink').href = `exams.html?attempt=${encodeURIComponent(session.id)}`;
}

function updateSavedQuizProgress() {
  const data = ProgressManager.getData();
  document.getElementById('savedQuizProgress').textContent = data.quizzesTaken ? `${data.quizzesTaken} اختبارات · أفضل نتيجة ${data.quizScore}%` : 'لم تكمل اختباراً بعد';
}
window.addEventListener('learning-progress', updateSavedQuizProgress);
function quizControls(busy) {
  quizBusy = busy;
  document.getElementById('quizContainer').setAttribute('aria-busy', String(busy));
  document.querySelectorAll('[data-quiz-config], [data-new-quiz], #qOptions button, #prevBtn, #nextBtn').forEach(control => control.disabled = busy);
  if (!quizCatalogReady) document.querySelectorAll('[data-quiz-config], [data-new-quiz]').forEach(control => control.disabled = true);
  document.querySelectorAll('[data-quiz-jump], #quizNextUnanswered').forEach(control => { control.disabled = busy; });
  if (!busy && quizAttempt && !quizFinished) loadQuestion(currentIndex);
}
function quizError(error, retry, saving = false) {
  document.getElementById('quizRequestMessage').textContent = error.message;
  document.getElementById('quizRequestError').hidden = false;
  document.getElementById('quizRequestRetry').onclick = retry;
  const notice = document.getElementById('quizRequestError');
  if (quizAttempt && !quizFinished) document.querySelector('.quiz-question-navigation').before(notice);
  else document.getElementById('quizEmptyState').before(notice);
  if (!quizAttempt) {
    document.getElementById('quizPoolStatus').textContent = 'تعذر تحميل الاختبار.';
    document.getElementById('questionCounter').textContent = 'الأسئلة غير متاحة حالياً';
  }
  if (saving) setProgressSaveState('لم يُحفظ التغيير. أعد المحاولة.');
  if (saving && quizExpiryAttempted) {
    notice.tabIndex = -1; notice.focus({ preventScroll: true });
    const id = quizAttempt.id;
    DisclosureMotion.scrollToStart(notice, () => quizAttempt?.id === id && !notice.hidden);
  }
}
async function quizRequest(endpoint, body) {
  try { return await accountRequest(endpoint, body); }
  catch (error) { if (error.status) throw error; return accountRequest(endpoint, body); }
}
function attemptPositionKey() { return `edu_quiz_position_${AccountManager.user.id}_${quizAttempt.id}`; }
function applyFilters() { startQuiz(); }
function restartQuiz() { pendingQuizStart = null; startQuiz(); }
async function startQuiz() {
  if (quizBusy || !quizCatalogReady) return;
  const config = { mode: isExamMode ? 'exam' : 'practice', category: document.getElementById('catSelect').value,
    difficulty: document.getElementById('diffSelect').value, kind: document.getElementById('kindSelect').value,
    source: document.getElementById('sourceSelect').value, limit: document.getElementById('lengthSelect').value };
  if (!pendingQuizStart || JSON.stringify(pendingQuizStart.config) !== JSON.stringify(config)) pendingQuizStart = { operationId: crypto.randomUUID(), config };
  const request = { ...config, operationId: pendingQuizStart.operationId };
  quizControls(true); document.getElementById('quizRequestError').hidden = true;
  try {
    const result = await quizRequest('/api/quizzes/start', request);
    renderSavedExamLink(result.sessions);
    pendingQuizStart = null;
    if (result.attempt) adoptQuizAttempt(result.attempt, false);
    else {
      clearInterval(timerInterval); quizAttempt = null; activeQuestions = []; quizFinished = false;
      document.getElementById('quizContainer').hidden = true; document.getElementById('quizFinalReport').hidden = true;
      document.getElementById('quizEmptyState').hidden = false; document.getElementById('quizTimerBadge').hidden = true;
      document.getElementById('quizPoolStatus').textContent = 'لا توجد أسئلة تطابق الاختيارات.';
      document.getElementById('questionCounter').textContent = 'لا توجد أسئلة'; document.getElementById('quizAnsweredCount').textContent = '';
      document.getElementById('quizProgressBar').style.width = '0%';
      document.getElementById('quizQuestionMap').hidden = true;
    }
  } catch (error) { quizError(error, startQuiz); }
  finally { quizControls(false); }
}
function clearQuizFilters() { for (const id of ['catSelect','diffSelect','kindSelect','sourceSelect']) document.getElementById(id).value = 'all'; startQuiz(); }
function adoptQuizAttempt(attempt, resume = true) {
  if (attempt.config.examId) { location.replace(`exams.html?attempt=${encodeURIComponent(attempt.id)}`); return; }
  const changed = quizAttempt?.id !== attempt.id;
  if (changed) quizExpiryAttempted = false;
  quizAttempt = attempt; activeQuestions = attempt.questions; userAnswers = attempt.answers;
  isExamMode = attempt.mode === 'exam'; quizFinished = attempt.status === 'submitted'; timerDeadline = attempt.deadline;
  serverClockOffset = attempt.serverTime - Date.now();
  currentIndex = Math.min(attempt.currentIndex || 0, activeQuestions.length - 1);
  if (resume) { try { const stored = sessionStorage.getItem(attemptPositionKey()); const saved = Number(stored); if (stored !== null && Number.isInteger(saved) && saved >= 0 && saved < activeQuestions.length) currentIndex = saved; } catch {} }
  for (const [id, field] of [['catSelect','category'],['diffSelect','difficulty'],['kindSelect','kind'],['lengthSelect','limit']]) document.getElementById(id).value = attempt.config[field];
  document.getElementById('sourceSelect').value = attempt.config.source || 'all';
  const mode = document.getElementById('modeToggleBtn');
  mode.textContent = isExamMode ? 'العودة إلى التدريب' : 'محاكاة المباراة'; mode.setAttribute('aria-pressed', String(isExamMode));
  document.getElementById('quizEmptyState').hidden = true; document.getElementById('quizFinalReport').hidden = !quizFinished;
  document.getElementById('quizContainer').hidden = quizFinished;
  document.getElementById('quizPoolStatus').textContent = `${activeQuestions.length} أسئلة في هذه المحاولة · ${attempt.poolSize} أسئلة مطابقة من بنك يضم ${attempt.bankSize} سؤالاً`;
  document.getElementById('retryQuizSave').hidden = true;
  document.getElementById('quizQuestionMap').hidden = quizFinished;
  if (changed) renderQuizNavigation();
  clearInterval(timerInterval);
  if (quizFinished) showQuizResult();
  else {
    loadQuestion(currentIndex);
    document.getElementById('quizTimerBadge').hidden = !isExamMode;
    if (isExamMode) { updateTimerBadge(); timerInterval = setInterval(updateTimerBadge, 1000); }
  }
}
function renderQuizNavigation() {
  const navigation = document.getElementById('quizQuestionNav'); navigation.replaceChildren();
  activeQuestions.forEach((question, index) => {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.quizJump = index;
    button.append(document.createTextNode(String(index + 1)));
    const marker = document.createElement('span'); marker.textContent = '✓'; marker.setAttribute('aria-hidden', 'true'); marker.hidden = true; button.append(marker);
    button.onclick = () => navigateQuizQuestion(index); navigation.appendChild(button);
  });
}
function navigateQuizQuestion(index) {
  if (quizBusy || quizFinished || index < 0 || index >= activeQuestions.length) return;
  loadQuestion(index);
  document.getElementById('qTitle').focus({ preventScroll: true });
  const id = quizAttempt.id;
  DisclosureMotion.scrollToStart(document.getElementById('quizContainer'), () => quizAttempt?.id === id && currentIndex === index && !quizFinished);
}
function nextUnansweredQuizQuestion() {
  if (quizBusy || quizFinished) return;
  for (let offset = 1; offset <= activeQuestions.length; offset++) {
    const index = (currentIndex + offset) % activeQuestions.length;
    if (userAnswers[activeQuestions[index].id] === undefined) { navigateQuizQuestion(index); return; }
  }
}
function loadQuestion(index) {
  if (index < 0 || index >= activeQuestions.length || quizFinished) return;
  currentIndex = index; try { sessionStorage.setItem(attemptPositionKey(), String(index)); } catch {}
  const question = activeQuestions[index];
  document.getElementById('qCategoryBadge').textContent = question.category; document.getElementById('qDiffBadge').textContent = question.difficulty;
  document.getElementById('qKindBadge').textContent = question.kind === 'situation' ? 'وضعية تطبيقية' : 'سؤال مفاهيمي';
  document.getElementById('questionCounter').textContent = `السؤال ${index + 1} من ${activeQuestions.length}`;
  document.getElementById('qTitle').textContent = question.question;
  document.getElementById('qFigure').hidden = question.figure !== 'open-circle';
  const origin = document.getElementById('qOrigin'); origin.hidden = !question.sourceExamId;
  origin.textContent = question.sourceExamId ? `من ورقة ${question.sourceExamId.slice(-4)} · السؤال الأصلي Q${question.examNumber} · الحروف تطابق الاختيارات الأصلية` : '';
  const scenario = document.getElementById('qScenario'); scenario.hidden = !question.scenario; scenario.textContent = question.scenario || '';
  document.getElementById('qExplanation').classList.remove('show');
  const options = document.getElementById('qOptions'); options.replaceChildren(); const chosen = userAnswers[question.id];
  // Keep the paper's letters in order, including attempts saved with shuffled choices.
  const presentedOptions = question.sourceExamId
    ? [...question.presentedOptions].sort((left, right) => left.originalIndex - right.originalIndex)
    : question.presentedOptions;
  presentedOptions.forEach((option, displayedIndex) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'quiz-opt'; button.dataset.optionIndex = option.originalIndex;
    button.textContent = `${question.sourceExamId ? 'ABCDE'[option.originalIndex] : ['أ','ب','ج','د','هـ'][displayedIndex]}. ${option.text}`; button.setAttribute('aria-pressed', String(chosen === option.originalIndex));
    if (chosen !== undefined) {
      if (chosen === option.originalIndex) button.classList.add(isExamMode ? 'selected' : chosen === question.correctAnswer ? 'correct' : 'wrong');
      if (!isExamMode && option.originalIndex === question.correctAnswer) button.classList.add('correct');
    }
    button.disabled = quizBusy || quizExpiryAttempted || !isExamMode && chosen !== undefined; button.onclick = () => selectOption(option.originalIndex, question); options.appendChild(button);
  });
  if (chosen !== undefined && !isExamMode) showExplanation(question);
  document.getElementById('prevBtn').disabled = quizBusy || index === 0; document.getElementById('nextBtn').disabled = quizBusy;
  document.getElementById('nextBtn').textContent = index === activeQuestions.length - 1 ? 'إنهاء الاختبار' : 'التالي ←'; updateAttemptProgress();
}
async function selectOption(choice, question) {
  if (quizBusy || quizFinished || question.id !== activeQuestions[currentIndex]?.id || !isExamMode && userAnswers[question.id] !== undefined) return;
  const payload = { attemptId: quizAttempt.id, questionId: question.id, choice, currentIndex };
  const restoreFocus = document.activeElement?.closest('#qOptions');
  quizControls(true); setProgressSaveState('جارٍ حفظ الإجابة...'); document.getElementById('quizRequestError').hidden = true;
  try {
    const result = await quizRequest('/api/quizzes/answer', payload); adoptQuizAttempt(result.attempt); setProgressSaveState('تم حفظ الإجابة');
    if (quizFinished) { await AccountManager.refresh(); await loadQuizHistory(); }
  } catch (error) { quizError(error, () => selectOption(choice, question), true); }
  finally {
    quizControls(false);
    if (restoreFocus && !quizFinished && document.activeElement === document.body) {
      const target = isExamMode ? document.querySelector(`[data-option-index="${choice}"]`) : document.getElementById('nextBtn');
      if (target && !target.disabled) target.focus({ preventScroll: true });
    }
  }
}
function updateAttemptProgress() {
  const answered = Object.keys(userAnswers).length;
  document.getElementById('quizProgressBar').style.width = `${answered / activeQuestions.length * 100}%`;
  document.getElementById('quizAnsweredCount').textContent = `أجبت عن ${answered} من ${activeQuestions.length}`;
  const score = activeQuestions.reduce((sum,q) => sum + (q.correctAnswer !== undefined && userAnswers[q.id] === q.correctAnswer ? 1 : 0), 0);
  document.getElementById('scoreTrackerText').textContent = isExamMode ? `${answered} أسئلة مجاب عنها` : `الدرجة: ${score} / ${answered}`;
  document.querySelectorAll('[data-quiz-jump]').forEach(button => {
    const index = Number(button.dataset.quizJump); const saved = userAnswers[activeQuestions[index].id] !== undefined;
    button.classList.toggle('is-answered', saved); button.querySelector('span').hidden = !saved;
    button.setAttribute('aria-label', `السؤال ${index + 1}${saved ? '، إجابته محفوظة' : '، دون إجابة'}`);
    if (index === currentIndex) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
  });
  document.getElementById('quizNextUnanswered').disabled = quizBusy || answered === activeQuestions.length;
}
function showExplanation(question) {
  document.getElementById('qExpText').textContent = question.explanation; document.getElementById('qExpSource').textContent = question.source;
  document.getElementById('qLearningReferences').innerHTML = LessonReferences.html(question);
  document.getElementById('qExplanation').classList.add('show');
}
function prevQuestion() { navigateQuizQuestion(currentIndex - 1); }
function nextQuestion() { if (quizBusy) return; if (currentIndex < activeQuestions.length - 1) navigateQuizQuestion(currentIndex + 1); else finishQuiz(); }
async function finishQuiz() {
  if (quizBusy || quizFinished || !quizAttempt) return;
  if (timerDeadline && Date.now() + serverClockOffset >= timerDeadline) quizExpiryAttempted = true;
  quizControls(true); document.getElementById('quizRequestError').hidden = true; setProgressSaveState('جارٍ حفظ النتيجة...');
  try {
    const result = await quizRequest('/api/quizzes/submit', { attemptId: quizAttempt.id });
    adoptQuizAttempt(result.attempt); acceptLearningPayload(result); setProgressSaveState('تم حفظ النتيجة'); await loadQuizHistory();
  } catch (error) { quizError(error, finishQuiz, true); }
  finally { quizControls(false); }
}
function optionText(question, index) { return question.presentedOptions.find(option => option.originalIndex === index)?.text || 'لم تجب'; }
function showQuizResult() {
  clearInterval(timerInterval); document.getElementById('quizTimerBadge').hidden = true;
  document.getElementById('questionCounter').textContent = 'تم تسليم الاختبار';
  const result = quizAttempt.result; document.getElementById('finalScorePercent').textContent = `${result.percent}%`;
  document.getElementById('finalScoreMsg').textContent = `أجبت بشكل صحيح عن ${result.score} من ${result.total} سؤالاً. راجع التعليلات والمجزوءات المرتبطة، ثم جرب محاولة جديدة.`;
  const review = document.getElementById('quizAnswerReview'); review.replaceChildren();
  activeQuestions.forEach((question,index) => {
    const detail = document.createElement('details'); detail.className = 'quiz-review-item'; const summary = document.createElement('summary'); const selected = userAnswers[question.id];
    detail.dataset.result = AssessmentReview.status(question, userAnswers);
    summary.textContent = `${index + 1}. ${selected === undefined ? 'دون إجابة' : selected === question.correctAnswer ? '✓ صحيحة' : 'إجابة غير صحيحة'} · ${question.question}`; detail.appendChild(summary);
    for (const text of [question.scenario, `إجابتك: ${optionText(question,selected)}`, `الإجابة الصحيحة: ${optionText(question,question.correctAnswer)}`, question.explanation, question.source]) {
      if (!text) continue; const paragraph = document.createElement('p'); paragraph.textContent = text; detail.appendChild(paragraph);
    }
    const references = document.createElement('div'); references.innerHTML = LessonReferences.html(question); detail.appendChild(references);
    review.appendChild(detail);
  });
  AssessmentReview.mount(document.getElementById('quizReviewControls'), review);
  updateAttemptProgress();
  document.getElementById('quizResultTitle').focus({ preventScroll: true });
  const id = quizAttempt.id;
  DisclosureMotion.scrollToStart(document.getElementById('quizFinalReport'), () => quizAttempt?.id === id && quizFinished);
}
function toggleExamMode() { if (quizBusy) return; isExamMode = !isExamMode; pendingQuizStart = null; startQuiz(); }
function updateTimerBadge() {
  if (!timerDeadline || quizFinished) return;
  const remaining = Math.max(0, Math.ceil((timerDeadline - Date.now() - serverClockOffset) / 1000));
  document.getElementById('quizTimerBadge').textContent = `${String(Math.floor(remaining / 60)).padStart(2,'0')}:${String(remaining % 60).padStart(2,'0')}`;
  if (!remaining && !quizBusy && !quizExpiryAttempted) { quizExpiryAttempted = true; finishQuiz(); }
}
async function loadQuizHistory() {
  const container = document.getElementById('quizHistory'); const weaknesses = document.getElementById('quizWeaknesses');
  try {
    const result = await accountRequest('/api/quizzes/history'); container.replaceChildren(); weaknesses.replaceChildren();
    if (!result.attempts.length) container.textContent = 'ستظهر نتائجك هنا بعد إكمال أول محاولة.';
    result.attempts.forEach(attempt => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'history-row';
      const label = attempt.examId ? `امتحان ${attempt.examId.slice(-4)}` : attempt.mode === 'exam' ? 'محاكاة' : 'تدريب';
      button.textContent = `${new Date(attempt.finishedAt).toLocaleDateString('ar-MA')} · ${label} · ${attempt.score}/${attempt.total} (${attempt.percent}%)`;
      button.onclick = () => openQuizHistoryAttempt(attempt.id); container.appendChild(button);
    });
    if (result.weaknesses.length) {
      const heading = document.createElement('h3'); heading.textContent = 'مجالات تستحق المراجعة'; weaknesses.appendChild(heading);
      result.weaknesses.forEach(item => { const link = document.createElement(item.moduleId ? 'a' : 'p'); if (item.moduleId) link.href = `modules.html#${item.moduleId}`; link.textContent = `${item.category} · ${item.missed} إجابات تحتاج مراجعة`; weaknesses.appendChild(link); });
    }
  } catch { container.textContent = 'تعذر تحميل النتائج السابقة.'; }
}
async function openQuizHistoryAttempt(id) {
  if (quizBusy) return;
  quizControls(true); document.getElementById('quizRequestError').hidden = true;
  try { adoptQuizAttempt((await accountRequest(`/api/quizzes/attempt?id=${encodeURIComponent(id)}`)).attempt, false); }
  catch (error) { quizError(error, () => openQuizHistoryAttempt(id)); }
  finally { quizControls(false); }
}
async function initializeQuiz() {
  if (quizBusy) return;
  quizControls(true);
  document.getElementById('quizRequestError').hidden = true;
  if (!quizAttempt) {
    document.getElementById('quizPoolStatus').textContent = 'جارٍ إعداد الاختبار...';
    document.getElementById('questionCounter').textContent = 'جارٍ إعداد الأسئلة...';
  }
  try {
    const bank = await accountRequest('/api/quizzes/catalog');
    document.getElementById('quizBankTotal').textContent = bank.total;
    document.getElementById('quizBankSituations').textContent = bank.situations;
    document.getElementById('quizBankArchive').textContent = bank.examQuestions;
    for (const [id, values] of [['catSelect', bank.categories.map(value => ({ id: value, title: value }))], ['sourceSelect', bank.sources]]) {
      const select = document.getElementById(id);
      for (const value of values) if (![...select.options].some(option => option.value === value.id)) {
        const option = document.createElement('option'); option.value = value.id; option.textContent = value.title; select.appendChild(option);
      }
    }
    const requestedSource = new URLSearchParams(location.search).get('source');
    if (requestedSource && [...document.getElementById('sourceSelect').options].some(option => option.value === requestedSource)) document.getElementById('sourceSelect').value = requestedSource;
    const id = new URLSearchParams(location.search).get('attempt');
    const active = await accountRequest('/api/quizzes/active?scope=quiz');
    renderSavedExamLink(active.sessions);
    const result = id ? await accountRequest(`/api/quizzes/attempt?id=${encodeURIComponent(id)}`) : active;
    quizCatalogReady = true;
    quizControls(false);
    if (result.attempt && !requestedSource) { adoptQuizAttempt(result.attempt); if (result.attempt.status === 'submitted') await AccountManager.refresh(); } else await startQuiz();
  } catch (error) { quizControls(false); quizError(error, initializeQuiz); }
  finally { await loadQuizHistory(); }
}
document.addEventListener('DOMContentLoaded', async () => {
  await AccountManager.ready; if (!AccountManager.user) return;
  await initializeQuiz();
});
document.getElementById('quizNextUnanswered').addEventListener('click', nextUnansweredQuizQuestion);
window.addEventListener('beforeunload', event => { if (quizBusy) { event.preventDefault(); event.returnValue = ''; } });

