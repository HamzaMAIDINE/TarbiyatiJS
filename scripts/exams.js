'use strict';
let examAttempt = null;
let examLibrary = [];
let examBusy = false;
let examTimerInterval = null;
let examClockOffset = 0;
let pendingExamStart = null;
let examRetryAction = null;
let resumableExamId = null;
let examNavigationIndex = -1;
let examExpiryAttempted = false;
let examSessions = [];
const examText = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const examElement = id => document.getElementById(id);
const examFinished = () => examAttempt?.status === 'submitted';
const examPaused = () => examAttempt?.status === 'paused';

function acceptExamSessions(result) { if (Array.isArray(result.sessions)) examSessions = result.sessions; }
function rememberExamSession(attempt) {
  examSessions = examSessions.filter(session => session.id !== attempt.id && (!['active','paused'].includes(attempt.status) || session.examId !== attempt.config.examId));
  if (['active','paused'].includes(attempt.status)) examSessions.unshift({ id:attempt.id, examId:attempt.config.examId,
    status:attempt.status, version:attempt.version, answered:Object.keys(attempt.answers).length });
}

function examError(error, retry) {
  examElement('examErrorMessage').textContent = error.message || 'تعذر إتمام الطلب.';
  examElement('examError').hidden = false;
  examRetryAction = retry;
  examElement('examRetry').hidden = !retry;
  if (examAttempt) examElement('examSessionError').appendChild(examElement('examError'));
}
function examSetBusy(busy) {
  examBusy = busy;
  document.querySelectorAll('[data-exam-start], [data-exam-history], #examResume, #examRetry, #examTogglePause').forEach(button => { button.disabled = busy; });
  examElement('examSubmit').disabled = busy || examPaused();
  document.querySelectorAll('#examAnswers input').forEach(input => { input.disabled = busy || examFinished() || examPaused() || examExpiryAttempted; });
  examElement('examNextUnanswered').disabled = busy || !examAttempt || examFinished() || examPaused() || Object.keys(examAttempt.answers).length === examAttempt.questions.length;
  examElement('examAnswers').setAttribute('aria-busy', String(busy));
}
function examScroll(element) {
  const id = examAttempt?.id;
  const index = examAttempt?.questions.findIndex(question => element.id === `exam-q-${question.id}`);
  if (index >= 0) { examNavigationIndex = index; updateExamProgress(); }
  const focusTarget = element.id === 'examWorkspace' ? examElement('activeExamTitle') : element.id === 'examCorrection' ? examElement('examCorrectionTitle') : element.querySelector('legend') || element;
  focusTarget.tabIndex = -1; focusTarget.focus({ preventScroll: true });
  DisclosureMotion.scrollToStart(element, () => examAttempt?.id === id, {
    offset: () => !examFinished() && element !== examElement('examWorkspace') ? examElement('examSessionTools').getBoundingClientRect().height + 12 : 0
  });
}
function nextUnansweredExamQuestion() {
  if (!examAttempt || examBusy || examFinished()) return;
  for (let offset = 1; offset <= examAttempt.questions.length; offset++) {
    const index = (examNavigationIndex + offset) % examAttempt.questions.length;
    const question = examAttempt.questions[index];
    if (examAttempt.answers[question.id] === undefined) { examScroll(examElement(`exam-q-${question.id}`)); return; }
  }
}
function renderExamLibrary() {
  examElement('examLibraryStatus').textContent = `${examLibrary.length} دورات · ${examLibrary.reduce((count, exam) => count + exam.questionCount, 0)} سؤالاً بترقيمها الأصلي`;
  examElement('examLibrary').innerHTML = examLibrary.map(exam => `<article class="exam-card"><span class="exam-card-year" dir="ltr">${exam.year}</span><h2>${examText(exam.title)}</h2><div class="exam-card-facts"><span>${exam.questionCount} سؤالاً</span><span>${exam.durationMinutes} دقيقة</span><span>المعامل ${exam.coefficient}</span></div><p>${exam.gradableCount} سؤالاً يحتسب في النتيجة التدريبية${exam.gradableCount < exam.questionCount ? ` · ${exam.questionCount - exam.gradableCount} للمراجعة دون تنقيط` : ''}. التصحيح والتعليل بعد التسليم.</p><button class="btn btn-primary" type="button" data-exam-start="${exam.id}">اجتياز امتحان ${exam.year} ←</button><a class="text-link" href="quiz.html?source=${exam.id}">تدريب بأسئلة هذه الدورة</a></article>`).join('');
}
function sourcePageHTML(url, label) {
  return `<a href="${examText(url)}" target="_blank" rel="noopener noreferrer"><img src="${examText(url)}" alt="${examText(label)}" loading="lazy" width="110" height="125"><span>${examText(label)} ↗</span></a>`;
}
function renderExamPaper() {
  const paper = examAttempt.exam;
  const finished = examFinished();
  examElement('examWorkspace').classList.toggle('is-submitted', finished);
  examElement('examWorkspace').classList.toggle('is-paused', examPaused());
  examElement('examPausedNotice').hidden = !examPaused();
  examElement('examPausedQuizLink').hidden = !examPaused();
  examElement('examTogglePause').hidden = finished;
  examElement('examTogglePause').textContent = examPaused() ? 'استئناف الامتحان' : 'إيقاف مؤقت';
  examElement('examNextUnanswered').hidden = finished || examPaused();
  examElement('examOpenCorrection').hidden = !finished;
  examElement('examWorkspace').hidden = false;
  examElement('activeExamTitle').textContent = paper.title;
  examElement('examAttemptNote').textContent = finished ? 'محاولة مسلمة · التصحيح والتعليل في نهاية الورقة'
    : examPaused() ? 'الوقت متوقف وإجاباتك محفوظة. استأنف الامتحان عندما تكون مستعداً.'
    : 'تحفظ إجاباتك في حسابك. أوقف الامتحان مؤقتاً قبل مغادرة الصفحة لحفظ الوقت المتبقي.';
  examElement('examCorrectionNote').textContent = paper.correctionNote;
  examElement('examScoringNote').textContent = paper.scoringNote || 'تنقيط تدريبي: نقطة للصحيح وصفر للخطأ أو السؤال غير المجاب عنه. يحتسب فقط ما له تصحيح محدد.';
  examElement('examSourcePages').innerHTML = paper.pages.map(page => sourcePageHTML(page.url, `الصفحة ${page.number}`)).join('');
  examElement('examPassage').hidden = !paper.passage;
  examElement('examPassageNote').textContent = paper.contextNote || '';
  examElement('examPassageText').textContent = paper.passage || '';
  examElement('examPassageSource').textContent = paper.passageSource || '';
  examElement('examQuestionNav').innerHTML = examAttempt.questions.map(question => `<button type="button" data-exam-jump="${question.id}" aria-label="السؤال ${question.examNumber}">${question.examNumber}</button>`).join('');
  examElement('examQuestions').innerHTML = examAttempt.questions.map(question => `<article class="exam-question" id="exam-q-${question.id}"><fieldset><legend><bdi>Q${question.examNumber}</bdi>${examText(question.question)}</legend>${question.figure === 'open-circle' ? '<figure class="question-figure"><svg viewBox="0 0 120 120" width="100" height="100" role="img" aria-label="دائرة غير مكتملة"><circle cx="60" cy="60" r="42" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="225 40"/></svg></figure>' : ''}${question.presentedOptions.map(option => `<label class="exam-choice"><input type="radio" name="exam-answer-${question.id}" value="${option.originalIndex}" data-exam-question="${question.id}" ${examAttempt.answers[question.id] === option.originalIndex ? 'checked' : ''} ${finished ? 'disabled' : ''}><bdi>${'ABCDE'[option.originalIndex]}</bdi><span>${examText(option.text)}</span></label>`).join('')}</fieldset><a class="exam-question-source" href="${examText(question.sourcePage)}" target="_blank" rel="noopener noreferrer">صورة السؤال الأصلي ↗</a></article>`).join('');
  examElement('examSubmit').closest('.exam-submit-row').hidden = finished;
  examElement('examTimerBox').hidden = finished;
  examElement('examCorrection').hidden = !finished;
  examElement('examCorrectionAnswers').replaceChildren();
  if (finished) renderExamCorrection();
  updateExamProgress();
  examSetBusy(examBusy);
  clearInterval(examTimerInterval);
  if (!finished) { updateExamTimer(); if (!examPaused()) examTimerInterval = setInterval(updateExamTimer, 1000); }
}
function updateExamProgress() {
  const answered = Object.keys(examAttempt.answers).length;
  examElement('examAnswered').textContent = `أجبت عن ${answered} من ${examAttempt.questions.length} سؤالاً`;
  examElement('examProgress').value = answered;
  examElement('examSubmitHint').textContent = examPaused() ? 'الامتحان متوقف مؤقتاً. استأنفه لتعديل إجاباتك أو تسليم الورقة.' : answered < examAttempt.questions.length
    ? `بقي ${examAttempt.questions.length - answered} سؤالاً دون إجابة. يمكن تعديل اختياراتك حتى التسليم.`
    : 'أجبت عن جميع الأسئلة. راجع اختياراتك أو سلم الامتحان لعرض التصحيح.';
  document.querySelectorAll('[data-exam-jump]').forEach(button => {
    const answered = examAttempt.answers[button.dataset.examJump] !== undefined;
    button.classList.toggle('is-answered', answered);
    button.setAttribute('aria-label', `السؤال ${button.textContent}${answered ? '، إجابته محفوظة' : '، دون إجابة'}`);
  });
  examElement('examResume').hidden = !resumableExamId || resumableExamId === examAttempt.id;
  examElement('examNextUnanswered').disabled = examBusy || examFinished() || answered === examAttempt.questions.length;
  document.querySelectorAll('[data-exam-jump]').forEach((button, index) => {
    if (index === examNavigationIndex) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
  });
}
function renderExamCorrection() {
  const result = examAttempt.result;
  examElement('examResultScore').textContent = `${result.score} / ${result.total}`;
  examElement('examResultSummary').textContent = `${result.percent}% · أجبت عن ${result.answered} من ${examAttempt.questions.length} سؤالاً. يمكنك مراجعة التعليل والمجزوءة لكل بند أدناه.`;
  const excluded = examAttempt.questions.length - result.total;
  examElement('examResultNote').textContent = excluded ? `استثني ${excluded} سؤالاً غير محسوم من مقام النتيجة ومن تحليل التعثرات. تعرض هذه البنود للمراجعة مع بيان سبب عدم حسمها.` : 'النتيجة تدريبية. حروف التصحيح من الجدول المرفق، والتعليلات إعداد تربيتي.';
  examElement('examCorrectionAnswers').innerHTML = examAttempt.questions.map(question => {
    const choice = examAttempt.answers[question.id];
    const reviewed = question.correctAnswer === null;
    const selected = question.presentedOptions.find(option => option.originalIndex === choice);
    const correct = question.presentedOptions.find(option => option.originalIndex === question.correctAnswer);
    const status = reviewed ? 'للمراجعة · خارج التنقيط' : choice === question.correctAnswer ? 'إجابة صحيحة' : choice === undefined ? 'دون إجابة' : 'إجابة غير صحيحة';
return `<article class="exam-correction-item" data-result="${AssessmentReview.status(question, examAttempt.answers)}"><h3><bdi>Q${question.examNumber}</bdi> · ${status}</h3><p>${examText(question.question)}</p><p><strong>اختيارك:</strong> ${selected ? `<bdi>${'ABCDE'[choice]}</bdi> · ${examText(selected.text)}` : 'لم تجب'}</p><p><strong>${reviewed ? 'التصحيح:' : 'الجواب المعتمد تدريبياً:'}</strong> ${reviewed ? 'لم يحسم، ولا يحتسب في النتيجة.' : `<bdi>${'ABCDE'[question.correctAnswer]}</bdi> · ${examText(correct.text)}`}</p><p><strong>التعليل والربط بالمجزوءة:</strong> ${examText(question.explanation)}</p>${question.reviewNote ? `<p class="exam-note">${examText(question.reviewNote)}</p>` : ''}<p class="exam-correction-source">${examText(question.source)}</p><div class="exam-correction-links">${LessonReferences.html(question)}<a href="${examText(question.sourcePage)}" target="_blank" rel="noopener noreferrer">قارن بصورة السؤال ↗</a></div></article>`;
  }).join('');
  const scans = examAttempt.exam.correctionScans || [];
  examElement('examCorrectionOriginals').hidden = !scans.length;
  examElement('examCorrectionScans').innerHTML = scans.map((url, index) => sourcePageHTML(url, `صورة التصحيح ${index + 1}`)).join('');
  examElement('examPracticeLink').href = `quiz.html?source=${examAttempt.config.examId}`;
  let controls = examElement('examReviewControls');
  if (!controls) { controls = document.createElement('div'); controls.id = 'examReviewControls'; examElement('examCorrectionAnswers').before(controls); }
  AssessmentReview.mount(controls, examElement('examCorrectionAnswers'));
}
function adoptExamAttempt(attempt, scroll = true) {
  if (!attempt?.exam || !attempt.config.examId) throw new Error('هذه المحاولة لا تخص ورقة من أرشيف الامتحانات.');
  if (examAttempt?.id !== attempt.id || examAttempt?.status !== attempt.status) examExpiryAttempted = false;
  if (examAttempt?.id !== attempt.id) examNavigationIndex = Object.keys(attempt.answers).length ? attempt.currentIndex : -1;
  examAttempt = attempt;
  examClockOffset = attempt.serverTime - Date.now();
  examElement('examSaveStatus').textContent = examFinished()
    ? attempt.result.finishedAt >= attempt.deadline ? 'انتهى الوقت وتم تسليم الإجابات المحفوظة' : 'تم تسليم الامتحان وحفظ النتيجة'
    : examPaused() ? 'متوقف مؤقتاً · الوقت محفوظ' : Object.keys(attempt.answers).length ? 'إجاباتك محفوظة' : 'تحفظ الإجابات عند الاختيار';
  rememberExamSession(attempt);
  history.replaceState(null, '', `?attempt=${encodeURIComponent(attempt.id)}`);
  renderExamPaper();
  updateExamLibraryActions();
  if (scroll) examScroll(examElement(examFinished() ? 'examCorrection' : 'examWorkspace'));
}
function updateExamLibraryActions() {
  document.querySelectorAll('[data-exam-start]').forEach(button => {
    const year = button.dataset.examStart.slice(-4);
    const session = examSessions.find(session => session.examId === button.dataset.examStart);
    button.textContent = `${session ? 'استئناف' : 'اجتياز'} امتحان ${year} ←`;
  });
  const resumable = examSessions.find(session => session.id !== examAttempt?.id) || examSessions[0];
  resumableExamId = resumable?.id || null;
  examElement('examResume').hidden = !resumable || resumable.id === examAttempt?.id;
  if (resumable) examElement('examResume').textContent = `استئناف امتحان ${resumable.examId.slice(-4)} ←`;
}
async function startArchivedExam(id) {
  if (examBusy) return;
  const session = examSessions.find(session => session.examId === id);
  if (session) { await continueArchivedExam(session.id); return; }
  if (!pendingExamStart || pendingExamStart.examId !== id) pendingExamStart = { examId: id, operationId: crypto.randomUUID(), mode: 'exam' };
  examSetBusy(true); examElement('examError').hidden = true;
  try {
    const result = await accountRequest('/api/quizzes/start', pendingExamStart);
    pendingExamStart = null; acceptExamSessions(result); adoptExamAttempt(result.attempt);
  } catch (error) { examError(error, () => startArchivedExam(id)); }
  finally { examSetBusy(false); }
}
async function saveExamAnswer(questionId, choice) {
  if (examBusy || examFinished() || examPaused()) return;
  const index = examAttempt.questions.findIndex(question => question.id === questionId);
  examNavigationIndex = index;
  const focused = document.activeElement?.matches('[data-exam-question]') ? document.activeElement : null;
  const attemptId = examAttempt.id;
  examSetBusy(true); examElement('examError').hidden = true;
  examElement('examSaveStatus').textContent = 'جارٍ حفظ الاختيار...';
  try {
    const result = await accountRequest('/api/quizzes/answer', { attemptId, questionId, choice, currentIndex: index });
    if (result.attempt.status === 'submitted') {
      adoptExamAttempt(result.attempt); await AccountManager.refresh(); await loadExamHistory();
    } else {
      examAttempt = result.attempt; updateExamProgress();
      examElement('examSaveStatus').textContent = 'تم حفظ الاختيار في حسابك';
    }
  } catch (error) {
    document.querySelectorAll(`input[name="exam-answer-${questionId}"]`).forEach(input => { input.checked = Number(input.value) === examAttempt.answers[questionId]; });
    examElement('examSaveStatus').textContent = 'لم يحفظ الاختيار. أعد المحاولة.';
    await syncPausedExamError(error);
    examError(error, examPaused() ? null : () => saveExamAnswer(questionId, choice));
  } finally { examSetBusy(false); if (focused?.isConnected && !focused.disabled && document.activeElement === document.body) focused.focus({ preventScroll: true }); }
}
async function submitArchivedExam() {
  if (examBusy || !examAttempt || examFinished() || examPaused()) return;
  if (Date.now() + examClockOffset >= examAttempt.deadline) examExpiryAttempted = true;
  examSetBusy(true); examElement('examError').hidden = true;
  try {
    const result = await accountRequest('/api/quizzes/submit', { attemptId: examAttempt.id });
    adoptExamAttempt(result.attempt); await AccountManager.refresh(); await loadExamHistory();
  } catch (error) { await syncPausedExamError(error); examError(error, examPaused() ? null : submitArchivedExam); }
  finally { examSetBusy(false); }
}
function updateExamTimer() {
  if (!examAttempt || examFinished()) return;
  const remaining = Math.max(0, Math.ceil((examPaused() ? examAttempt.remainingMs : examAttempt.deadline - Date.now() - examClockOffset) / 1000));
  examElement('examTimer').textContent = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
  examElement('examTimerBox').classList.toggle('is-urgent', !examPaused() && remaining <= 300);
  examElement('examTimerBox').classList.toggle('is-paused', examPaused());
  examElement('examTimerBox').querySelector('small').textContent = examPaused() ? 'الوقت محفوظ' : 'الوقت المتبقي';
  if (!examPaused() && !remaining && !examBusy && !examExpiryAttempted) { examExpiryAttempted = true; submitArchivedExam(); }
}
async function syncPausedExamError(error, id = examAttempt?.id) {
  if (!['EXAM_PAUSED','EXAM_STATE_CHANGED'].includes(error.code) || !id) return;
  try { adoptExamAttempt((await accountRequest(`/api/quizzes/attempt?id=${encodeURIComponent(id)}`)).attempt, false); } catch {}
}
async function changeArchivedExamState(action, session) {
  if (examBusy) return;
  examSetBusy(true); examElement('examError').hidden = true;
  try {
    const result = await accountRequest(`/api/quizzes/${action}`, { attemptId:session.id, version:session.version,
      ...(action === 'pause' ? { currentIndex:Math.max(0, examNavigationIndex) } : {}) });
    acceptExamSessions(result); adoptExamAttempt(result.attempt, false);
    if (action === 'resume' && !examFinished()) examScroll(examElement(`exam-q-${examAttempt.questions[examAttempt.currentIndex].id}`));
    if (examFinished()) { await AccountManager.refresh(); await loadExamHistory(); }
  } catch (error) {
    await syncPausedExamError(error, session.id);
    examError(error, () => changeArchivedExamState(action, examSessions.find(current => current.id === session.id) || session));
  } finally { examSetBusy(false); }
}
async function continueArchivedExam(id) {
  const session = examSessions.find(session => session.id === id);
  if (session?.status === 'paused') await changeArchivedExamState('resume', session);
  else await openArchivedAttempt(id);
}
async function loadExamHistory() {
  try {
    const result = await accountRequest('/api/quizzes/history');
    const attempts = result.attempts.filter(attempt => attempt.examId);
    examElement('examHistory').innerHTML = attempts.length ? attempts.map(attempt => `<button type="button" class="history-row" data-exam-history="${attempt.id}">${examText(examLibrary.find(exam => exam.id === attempt.examId)?.title || 'امتحان سابق')} · ${examText(new Date(attempt.finishedAt).toLocaleDateString('ar-MA'))} · <bdi>${attempt.score} / ${attempt.total}</bdi> (${attempt.percent}%)</button>`).join('') : '<p class="exam-note">تظهر هنا نتائجك بعد تسليم امتحان كامل.</p>';
  } catch { examElement('examHistory').textContent = 'تعذر تحميل المحاولات السابقة.'; }
}
async function openArchivedAttempt(id) {
  if (examBusy) return;
  examSetBusy(true); examElement('examError').hidden = true;
  try { adoptExamAttempt((await accountRequest(`/api/quizzes/attempt?id=${encodeURIComponent(id)}`)).attempt); }
  catch (error) { examError(error, () => openArchivedAttempt(id)); }
  finally { examSetBusy(false); }
}
document.addEventListener('click', event => {
  const start = event.target.closest('[data-exam-start]');
  const jump = event.target.closest('[data-exam-jump]');
  const previous = event.target.closest('[data-exam-history]');
  if (start) startArchivedExam(start.dataset.examStart);
  else if (jump) examScroll(examElement(`exam-q-${jump.dataset.examJump}`));
  else if (previous) openArchivedAttempt(previous.dataset.examHistory);
});
examElement('examAnswers').addEventListener('change', event => {
  const input = event.target.closest('[data-exam-question]');
  if (input) saveExamAnswer(Number(input.dataset.examQuestion), Number(input.value));
});
examElement('examAnswers').addEventListener('submit', event => { event.preventDefault(); submitArchivedExam(); });
examElement('examRetry').addEventListener('click', () => examRetryAction?.());
examElement('examResume').addEventListener('click', () => { if (resumableExamId) continueArchivedExam(resumableExamId); });
examElement('examTogglePause').addEventListener('click', () => {
  if (examAttempt && !examFinished()) changeArchivedExamState(examPaused() ? 'resume' : 'pause', examAttempt);
});
examElement('examNextUnanswered').addEventListener('click', nextUnansweredExamQuestion);
examElement('examOpenCorrection').addEventListener('click', () => examScroll(examElement('examCorrection')));
examElement('examSessionTools').querySelector('.exam-session-actions').prepend(examElement('examTimerBox'));
const examToolsObserver = new ResizeObserver(() => {
  document.documentElement.style.setProperty('--exam-sticky-top', `${document.querySelector('.site-topbar').getBoundingClientRect().height}px`);
});
examToolsObserver.observe(document.querySelector('.site-topbar'));
window.addEventListener('beforeunload', event => { if (examBusy) { event.preventDefault(); event.returnValue = ''; } });
async function initializeExams() {
  if (examBusy) return;
  examSetBusy(true);
  examElement('examError').hidden = true;
  if (!examLibrary.length) examElement('examLibraryStatus').textContent = 'جارٍ تحميل الامتحانات...';
  try {
    const [library, active] = await Promise.all([accountRequest('/api/exams'), accountRequest('/api/quizzes/active?scope=exams')]);
    examLibrary = library.exams; renderExamLibrary();
    acceptExamSessions(active);
    const id = new URLSearchParams(location.search).get('attempt');
    if (id) adoptExamAttempt((await accountRequest(`/api/quizzes/attempt?id=${encodeURIComponent(id)}`)).attempt);
    else if (active.attempt?.config.examId) adoptExamAttempt(active.attempt);
    else if (examSessions.length) adoptExamAttempt((await accountRequest(`/api/quizzes/attempt?id=${encodeURIComponent(examSessions[0].id)}`)).attempt);
    updateExamLibraryActions();
  } catch (error) {
    if (!examLibrary.length) examElement('examLibraryStatus').textContent = 'تعذر تحميل الامتحانات.';
    examError(error, initializeExams);
  } finally { await loadExamHistory(); examSetBusy(false); }
}
document.addEventListener('DOMContentLoaded', async () => {
  await AccountManager.ready; if (!AccountManager.user) return;
  await initializeExams();
});
