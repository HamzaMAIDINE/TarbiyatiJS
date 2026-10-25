'use strict';

const AssessmentReview = (() => {
  function status(question, answers) {
    if (question.correctAnswer === null) return 'review';
    if (answers[question.id] === undefined) return 'unanswered';
    return answers[question.id] === question.correctAnswer ? 'correct' : 'wrong';
  }

  function mount(controls, list) {
    const items = [...list.children];
    const labels = { all: 'الكل', wrong: 'إجابات خاطئة', unanswered: 'دون إجابة', correct: 'إجابات صحيحة', review: 'خارج التنقيط' };
    const counts = { all: items.length };
    for (const item of items) counts[item.dataset.result] = (counts[item.dataset.result] || 0) + 1;
    controls.replaceChildren();
    const buttons = document.createElement('div');
    buttons.className = 'assessment-review-filters';
    buttons.setAttribute('role', 'group');
    buttons.setAttribute('aria-label', 'تصفية تصحيح الإجابات');
    const summary = document.createElement('p');
    summary.className = 'assessment-review-summary';
    summary.setAttribute('role', 'status');
    const empty = document.createElement('p');
    empty.className = 'assessment-review-empty';
    empty.textContent = 'لا توجد أسئلة ضمن هذا التصنيف.';
    empty.hidden = true;
    for (const [value, label] of Object.entries(labels)) {
      if (value === 'review' && !counts.review) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.reviewFilter = value;
      button.textContent = `${label} (${counts[value] || 0})`;
      button.setAttribute('aria-pressed', String(value === 'all'));
      button.onclick = () => {
        buttons.querySelectorAll('button').forEach(control => control.setAttribute('aria-pressed', String(control === button)));
        let visible = 0;
        items.forEach(item => { item.hidden = value !== 'all' && item.dataset.result !== value; if (!item.hidden) visible++; });
        summary.textContent = `عرض ${visible} من ${items.length} سؤالاً`;
        empty.hidden = visible > 0;
      };
      buttons.appendChild(button);
    }
    summary.textContent = `عرض ${items.length} من ${items.length} سؤالاً`;
    controls.append(buttons, summary, empty);
  }
  return { status, mount };
})();
