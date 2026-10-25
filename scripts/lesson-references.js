'use strict';

// Shared by practice feedback and the exam correction; no answer data is stored here.
const LessonReferences = (() => {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  function sourcesHTML(sources = []) {
    return sources.map(source => `<li><a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${escape(source.title)} ↗</a><span>${escape(source.locator)}</span></li>`).join('');
  }
  function html(question) {
    const references = question.lessonReferences || [];
    if (!references.length) return question.moduleId ? `<a class="text-link" href="modules.html#${escape(question.moduleId)}">راجع المجزوءة المرتبطة ←</a>` : '';
    return `<div class="question-learning-references"><p><strong>افهم الفكرة في الدرس</strong></p>${question.learningNote ? `<p class="learning-reference-note">${escape(question.learningNote)}</p>` : ''}${references.map(reference => `<div class="question-learning-reference"><a class="text-link" href="modules.html#${escape(reference.sectionId)}">${escape(reference.title)} ←</a><ul class="lesson-source-list">${sourcesHTML(reference.sources)}</ul></div>`).join('')}</div>`;
  }
  return { html, sourcesHTML };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = LessonReferences;
