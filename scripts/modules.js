const moduleTitles = CURRICULUM_DATA.map(module => module.title.replace(/^المجزوءة\s+\d+:\s*/, ''));
const moduleSearchIndex = new Map();
const moduleText = value => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));

function normalizeModuleSearch(text) {
  return text.toLowerCase().normalize('NFKC').replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآ]/g, 'ا').trim();
}

function moduleWorkshopHTML(module) {
  const workshop = module.workshop;
  const lessons = new Map(CURRICULUM_DATA.flatMap(item => item.sections.map(section => [section.id, section.title.replace(/^\d+\.\s*/, '')])));
  return `<section class="module-workshop" id="${module.id}-workshop" tabindex="-1" aria-labelledby="${module.id}-workshop-title">
    <span class="eyebrow">ورشة تطبيقية · حالة تدريبية من إعداد تربيتي</span>
    <h3 id="${module.id}-workshop-title">${moduleText(workshop.title)}</h3>
    <p>${moduleText(workshop.situation)}</p>
    <h4>حلل الموقف قبل كشف التفسير</h4><ol>${workshop.tasks.map(task => `<li>${moduleText(task)}</li>`).join('')}</ol>
    <details class="lesson-answer workshop-answer"><summary>اعرض التحليل المقترح ومعايير المراجعة</summary>
      <ol>${workshop.answer.map(answer => `<li>${moduleText(answer)}</li>`).join('')}</ol>
      <h4>راجع إجابتك</h4><ul>${workshop.criteria.map(criterion => `<li>${moduleText(criterion)}</li>`).join('')}</ul>
      <p class="module-reading-note">هذا تحليل مقترح؛ تقبل حلول أخرى إذا ربطت القرار بدليل وحافظت على الهدف وإمكان التحقق.</p>
    </details>
    <h4>مفاهيم يكثر الخلط بينها</h4><dl class="workshop-pitfalls">${workshop.pitfalls.map(item => `<div><dt>${moduleText(item.claim)}</dt><dd>${moduleText(item.correction)}</dd></div>`).join('')}</dl>
    <nav class="workshop-links" aria-label="راجع مفاهيم الورشة"><h4>ارجع إلى الشرح</h4><ul>${workshop.sectionIds.map(id => `<li><a href="#${id}">${moduleText(lessons.get(id))}</a></li>`).join('')}</ul>
      <a class="text-link" href="mindmaps.html#map-practice/${workshop.branchId}">اربط الحالة بمفاهيم الخريطة ←</a>
    </nav>
  </section>`;
}

function renderModules() {
  const data = ProgressManager.getData();
  const container = document.getElementById('modulesContainer');
  container.innerHTML = CURRICULUM_DATA.map((module, index) => {
    const done = data.completedModules.includes(module.id);
    // Index the lesson source too, so closed lesson content stays searchable.
    const searchSource = document.createElement('div');
    searchSource.innerHTML = module.sections.map(section => `${section.title} ${section.content}`).join(' ');
    moduleSearchIndex.set(module.id, normalizeModuleSearch(`${module.title} ${module.subtitle} ${module.badge} ${module.scope} ${module.studyGoals.join(' ')} ${searchSource.textContent} ${JSON.stringify(module.workshop)} ${module.sections.map(section => `${section.objectives.join(' ')} ${section.selfCheck.prompt} ${section.selfCheck.answer}`).join(' ')}`));
    return `
      <article class="module-accordion" id="${module.id}" data-badge="${module.badge}" data-completed="${done}">
        <h2>
          <button type="button" class="accordion-header" id="heading-${module.id}" aria-expanded="false" aria-controls="body-${module.id}" data-click="toggleAccordion" data-args="[&quot;${module.id}&quot;]">
            <span class="accordion-title">
              <span class="module-number" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
              <span class="accordion-text"><span class="module-heading">${moduleTitles[index] || module.title}</span><span class="module-subtitle">${module.subtitle}</span></span>
            </span>
            <span class="module-metadata">
              <span class="module-state" id="state-${module.id}">${done ? '✓ مكتملة' : ''}</span>
              <span class="card-badge">${module.sections.length} محاور</span>
              <span class="accordion-arrow" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m7 10 5 5 5-5"/></svg></span>
            </span>
          </button>
        </h2>
        <div class="accordion-body disclosure-panel" id="body-${module.id}" role="region" aria-labelledby="heading-${module.id}" hidden inert>
          <div class="accordion-content">
          <div class="reading-toolbar">
            <div class="reading-actions">
              <button class="btn btn-outline btn-sm" type="button" data-click="printModule" data-args="[&quot;${module.id}&quot;]">PDF / طباعة المجزوءة</button>
            </div>
            <button class="btn btn-sm ${done ? 'btn-secondary' : 'btn-primary'}" type="button" data-complete-button="${module.id}" aria-pressed="${done}" data-click="markDone" data-args="[&quot;${module.id}&quot;, &quot;$self&quot;]">${done ? '✓ مكتملة · تراجع عن الإتمام' : 'تحديد كمكتملة'}</button>
          </div>
          <p class="module-scope">${module.scope}</p>
          <p class="module-reading-note">اقرأ الشرح، وجرب التطبيق، ثم أجب عن سؤال التحقق قبل فتح الإجابة. المراجع للتوسع، وأرقامها تشير إلى صفحات عارض PDF بما فيها الغلاف.</p>
          <nav class="module-contents" aria-label="محاور ${moduleTitles[index] || module.title}"><h3>في هذه المجزوءة</h3><ol>${module.sections.map(section => `<li><a href="#${section.id}">${section.title.replace(/^\d+\.\s*/, '')}</a></li>`).join('')}</ol></nav>
          <div class="module-body-text">${module.sections.map(section => `<section class="lesson-section" id="${section.id}" tabindex="-1"><h3><a href="#${section.id}">${section.title}</a></h3><div class="lesson-objectives"><h4>ما الذي ستتعلمه؟</h4><ul>${section.objectives.map(goal => `<li>${moduleText(goal)}</li>`).join('')}</ul></div><div class="section-content">${section.content}</div><div class="lesson-practice"><h4>تحقق من فهمك</h4><p>${moduleText(section.selfCheck.prompt)}</p><details class="lesson-answer"><summary>اعرض الإجابة والتفسير</summary><p>${moduleText(section.selfCheck.answer)}</p></details></div><aside class="lesson-sources" aria-label="مراجع هذا المحور"><h4>مراجع للتوسع</h4><ul class="lesson-source-list">${LessonReferences.sourcesHTML(section.sources)}</ul></aside></section>`).join('')}${moduleWorkshopHTML(module)}<aside class="module-checkpoint"><h3>قبل الانتقال إلى الاختبار</h3><p>حاول شرح هذه النقاط بكلماتك وتطبيقها على موقف جديد:</p><ul>${module.studyGoals.map(goal => `<li>${moduleText(goal)}</li>`).join('')}</ul></aside></div>
          </div>
        </div>
      </article>`;
  }).join('');
  updateModuleCount();
  filterModules();
  openModuleFromHash();
}

function setModuleOpen(element, open, { scroll = false, ...options } = {}) {
  element.classList.toggle('open', open);
  const header = element.querySelector('.accordion-header');
  const panel = element.querySelector('.accordion-body');
  header.setAttribute('aria-expanded', String(open));
  if (!open && panel.contains(document.activeElement)) header.focus({ preventScroll: true });
  DisclosureMotion.setExpanded(panel, open, options);
  if (open && scroll) DisclosureMotion.scrollToStart(element, () => element.classList.contains('open'));
}

function toggleAccordion(id) {
  const element = document.getElementById(id);
  if (element) {
    const open = !element.classList.contains('open');
    if (open) collapseAllModules();
    setModuleOpen(element, open, { scroll: open });
    syncModuleDisclosures();
    if (open) ProgressManager.recordModuleVisit(id);
  }
}

function collapseAllModules(options) {
  document.querySelectorAll('.module-accordion').forEach(element => setModuleOpen(element, false, options));
  syncModuleDisclosures();
}

function expandAllModules() {
  document.querySelectorAll('.module-accordion').forEach(element => setModuleOpen(element, !element.hidden));
  syncModuleDisclosures();
  const first = document.querySelector('.module-accordion:not([hidden])');
  if (first) DisclosureMotion.scrollToStart(first, () => first.classList.contains('open'));
}

function syncModuleDisclosures() {
  const visible = [...document.querySelectorAll('.module-accordion')].filter(element => !element.hidden);
  document.getElementById('expandAllModulesBtn').disabled = !visible.length || visible.every(element => element.classList.contains('open'));
  document.getElementById('collapseAllModulesBtn').disabled = !visible.some(element => element.classList.contains('open'));
}

function filterModules() {
  const query = normalizeModuleSearch(document.getElementById('moduleSearchInput').value);
  const category = document.getElementById('moduleCategory').value;
  const status = document.getElementById('moduleStatus').value;
  let visible = 0;
  document.querySelectorAll('.module-accordion').forEach(element => {
    const match = (!query || moduleSearchIndex.get(element.id).includes(query)) &&
      (category === 'all' || element.dataset.badge === category) &&
      (status === 'all' || element.dataset.completed === status);
    element.hidden = !match;
    if (!match) setModuleOpen(element, false, { animate: false });
    if (match) visible++;
  });
  document.getElementById('moduleResultsCount').textContent = `عرض ${visible} من ${CURRICULUM_DATA.length} مجزوءات`;
  document.getElementById('moduleEmptyState').hidden = visible !== 0;
  syncModuleDisclosures();
}

function clearModuleFilters() {
  document.getElementById('moduleSearchInput').value = '';
  document.getElementById('moduleCategory').value = 'all';
  document.getElementById('moduleStatus').value = 'all';
  filterModules();
  document.getElementById('moduleSearchInput').focus();
}

function openModuleFromHash() {
  let id;
  try { id = decodeURIComponent(window.location.hash.slice(1)); } catch { return; }
  if (CURRICULUM_ALIASES[id]) {
    id = CURRICULUM_ALIASES[id];
    history.replaceState(null, '', '#' + id);
  }
  const target = document.getElementById(id);
  const element = target?.closest('.module-accordion');
  if (!element) return;
  document.getElementById('moduleSearchInput').value = '';
  document.getElementById('moduleCategory').value = 'all';
  document.getElementById('moduleStatus').value = 'all';
  filterModules();
  collapseAllModules({ animate: false });
  setModuleOpen(element, true, { animate: false });
  syncModuleDisclosures();
  ProgressManager.recordModuleVisit(element.id);
  if (target !== element) target.focus({ preventScroll: true });
  DisclosureMotion.scrollToStart(target, () => element.classList.contains('open') && window.location.hash.slice(1) === id);
}

function printModule(id) {
  return AcademicPrint.print('modules', id);
}

function printAllModules() {
  return AcademicPrint.print('modules', 'all');
}

async function markDone(id, button) {
  const data = ProgressManager.getData();
  const done = !data.completedModules.includes(id);
  button.disabled = true;
  try {
    if (await ProgressManager.setModuleCompleted(id, done)) showToast(done ? 'تم حفظ تقدمك في حسابك' : 'تم إلغاء إتمام المجزوءة');
  } finally { button.disabled = false; }
}

function syncModuleProgress() {
  const data = ProgressManager.getData();
  document.querySelectorAll('.module-accordion').forEach(element => {
    const done = data.completedModules.includes(element.id);
    element.dataset.completed = String(done);
    document.getElementById(`state-${element.id}`).textContent = done ? '✓ مكتملة' : '';
    const button = element.querySelector('[data-complete-button]');
    button.textContent = done ? '✓ مكتملة · تراجع عن الإتمام' : 'تحديد كمكتملة';
    button.className = `btn btn-sm ${done ? 'btn-secondary' : 'btn-primary'}`;
    button.setAttribute('aria-pressed', String(done));
  });
  updateModuleCount();
  filterModules();
}

function updateModuleCount() {
  const data = ProgressManager.getData();
  const count = CURRICULUM_DATA.filter(module => data.completedModules.includes(module.id)).length;
  document.getElementById('completedModulesCount').innerHTML = `<bdi dir="ltr">${count} / ${CURRICULUM_DATA.length}</bdi> مكتملة`;
}

document.addEventListener('DOMContentLoaded', async () => {
  await AccountManager.ready;
  if (AccountManager.user?.emailVerified) renderModules();
});
window.addEventListener('hashchange', openModuleFromHash);
window.addEventListener('learning-progress', syncModuleProgress);
