const SHEET_INPUTS = {subject:'inSubject',title:'inTitle',competence:'inCompetence',objectives:'inObjectives',
  pedagogy:'inPedagogy',criteria:'inCriteria',support:'inSupport',materials:'inMaterials',
  step1:'inStep1',step2:'inStep2',step3:'inStep3',step4:'inStep4',
  assessment1:'inAssessment1',assessment2:'inAssessment2',assessment3:'inAssessment3',assessment4:'inAssessment4',
  student1:'inStudent1',student2:'inStudent2',student3:'inStudent3',student4:'inStudent4',
  phaseDuration1:'inPhaseDuration1',phaseDuration2:'inPhaseDuration2',phaseDuration3:'inPhaseDuration3',phaseDuration4:'inPhaseDuration4', ...FICHE_META_INPUTS};
const LESSON_PRESETS = {
  science: {
    subject:'النشاط العلمي - السلك الابتدائي',title:'تنفس الكائنات الحية والتبادلات الغازية',
    competence:'حل وضعيات مشكلة دالة بتعبئة الموارد الخاصة بالوظائف الحيوية والتكيف لدى الكائنات الحية.',
    objectives:'1. يكتشف المتعلم دور الغلاصم في التنفس المائي.\n2. يقارن بين التنفس الرئوي والتنفس الغلاصمي.',
    pedagogy:'نهج التقصي وبيداغوجيا حل المشكلات',criteria:'يحدد عضو التنفس المناسب ويشرح وظيفته بلغة علمية واضحة.',
    support:'دعم مندمج فوري عبر التغذية الراجعة وتعديل التمثلات الخاطئة',materials:'صور سمكة وإنسان، وثائق تجريبية، مجسمات لأعضاء التنفس',
    step1:'ملاحظة سمكة تفتح فمها وغلاصمها تحت الماء، وجمع فرضيات المتعلمين حول طريقة تنفسها.',
    step2:'فحص وثائق تجريبية في مجموعات ومقارنة تنفس السمكة بتنفس الإنسان مع تعليل الفرضيات.',
    step3:'صياغة خلاصة حول الغلاصم والرئتين والتبادلات الغازية وتثبيت المصطلحات العلمية.',
    step4:'تطبيق المكتسبات على وضعية جديدة حول تنفس الضفدع في البر والماء.',
    assessment1:'تقويم تشخيصي للتمثلات السابقة دون تصحيح متسرع.',assessment2:'تقويم تكويني ومساعدة الأقران على تفسير الملاحظات.',
    assessment3:'التحقق من دقة الخلاصة وتمييز الغلاصم عن الرئتين.',assessment4:'تفسير عضو التنفس المناسب مع تقديم سند داعم للمتعثرين.'
  },
  math: {
    subject:'الرياضيات - السلك الثانوي الإعدادي',title:'المعادلات من الدرجة الأولى بمجهول واحد',
    competence:'ترييض وضعيات واقعية وصياغتها في شكل معادلات وحلها باستدلال منطقي.',
    objectives:'1. يتعرف مفهوم المعادلة والحل.\n2. يحل معادلات من شكل ax + b = c ويوظف خصائص التساوي.',
    pedagogy:'البيداغوجيا الفارقية (مجموعات المهام)',criteria:'يختار العمليات المناسبة ويحافظ على التساوي ويتحقق من الحل بالتعويض.',
    support:'دعم دوري (أسبوع الدعم والتثبيت Arrêt-bilan)',materials:'بطاقات مسائل، رسم ميزان، سبورة، أوراق عمل متدرجة',
    step1:'طرح مسألة شراء ذات ثمن مجهول وجمع الطرق المقترحة لتحديده.',
    step2:'تمثيل المسألة بمعادلة والعمل في مجموعات على إجراء العملية نفسها في طرفي التساوي.',
    step3:'صياغة قواعد حل المعادلة ax + b = c وتوضيح شروط القسمة والتحقق بالتعويض.',
    step4:'حل مسائل جديدة بمستويات مختلفة وتفسير الحل في سياق المسألة.',
    assessment1:'رصد فهم المتعلمين للتساوي والعمليات العكسية.',assessment2:'ملاحظة خطوات الحل ودعم الأخطاء في نقل الحدود.',
    assessment3:'مطالبة المتعلم بتبرير الحفاظ على التساوي.',assessment4:'التحقق من الحل بالتعويض وتقديم تمارين علاجية متدرجة.'
  },
  lang: {
    subject:'اللغة العربية - السلك الثانوي التأهيلي',title:'مهارة تحليل نص نثري: الخطاب الصحفي',
    competence:'فهم خصائص الخطاب الصحفي وتوظيف أدوات التحليل والتواصل في إنتاج نص منظم.',
    objectives:'1. يرصد تقنيات التقرير والإخبار.\n2. يحلل الحقول الدلالية والبعد الإقناعي في النص الصحفي.',
    pedagogy:'بيداغوجيا المشروع التشاركي',criteria:'يستشهد من النص ويميز الخبر عن الرأي وينظم التحليل بلغة سليمة.',
    support:'دعم مؤسساتي وفق مقاربة التدريس بالمسار المناسب TaRL',materials:'مقال صحفي مناسب، شبكة تحليل، معجم، أوراق عمل',
    step1:'قراءة العنوان والصورة وتوقع موضوع المقال ومناقشة وظيفة الصحافة.',
    step2:'قراءة المقال وتحديد الفكرة العامة والحقول الدلالية وتمييز المعلومات عن الآراء في مجموعات.',
    step3:'توليف خصائص الخطاب الصحفي وتنظيم نتائج التحليل مع الاستشهاد من النص.',
    step4:'تحليل فقرة صحفية جديدة وإنتاج خبر قصير وفق شبكة المعايير.',
    assessment1:'تقويم فهم المفردات وتوقعات القراءة.',assessment2:'تغذية راجعة حول الاستشهاد والتمييز بين الخبر والرأي.',
    assessment3:'مراجعة ترابط التحليل وصحة الاستنتاجات.',assessment4:'تقويم الإنتاج وفق الشبكة وتقديم دعم في الفهم والتنظيم واللغة.'
  }
};
completeFichePresets(LESSON_PRESETS, FICHE_PRESETS_FR);
let draftId = crypto.randomUUID(), draftVersion = 0, draftDirty = false, draftSaving = false, draftDeleting = false, draftConflict = false;
let draftTimer = null, sheetReady = false;
const draftCacheKey = () => 'edu_draft_pending_' + AccountManager.user.id;
function sheetFields() {
  return Object.fromEntries(Object.entries(SHEET_INPUTS).map(([key,id]) => [key,document.getElementById(id)?.value || '']));
}
function findFichePreset(fields) {
  for (const language of fields.language ? [fields.language] : ['ar','fr']) {
    const presets = language === 'fr' ? FICHE_PRESETS_FR : LESSON_PRESETS;
    for (const [key, preset] of Object.entries(presets)) {
      if (fields.title === preset.title && fields.subject === preset.subject) return { key, language, preset, subject: FICHE_SUBJECTS.find(item => item.id === key) };
    }
  }
  return null;
}
function fillMissingFicheStudentActivities() {
  const fields = sheetFields(); const match = findFichePreset(fields);
  if (!match) return;
  for (let index = 1; index <= 4; index++) if (!fields['student' + index].trim()) document.getElementById('inStudent' + index).value = match.preset['student' + index];
  updateSheet();
}
function fillSheet(fields) {
  fields = normalizeFicheFields(fields);
  ficheLanguage = fields.language;
  populateFicheSelectors(fields);
  for (const [key,id] of Object.entries(SHEET_INPUTS)) document.getElementById(id).value = fields[key] || '';
  applyFicheLanguageUI();
  renderSheet();
}
function blankFicheFields() {
  return { ...Object.fromEntries(Object.keys(SHEET_INPUTS).map(field => [field, ''])), language: ficheLanguage };
}
async function newBlankDraft() {
  if (draftSaving || draftDeleting) return;
  if (draftDirty && sheetFields().title.trim() && !await saveDraft()) return;
  clearTimeout(draftTimer); draftTimer = null;
  draftId = crypto.randomUUID(); draftVersion = 0; draftDirty = false; draftConflict = false;
  document.getElementById('draftConflictActions').hidden = true;
  fillSheet(blankFicheFields()); cacheDraft();
  document.getElementById('draftStatus').textContent = ficheText().newDraft;
  await refreshDraftList();
}
function renderSheet() {
  const fields = sheetFields();
  document.getElementById('ficheStudentRecovery').hidden = !fields.title.trim() || ![1,2,3,4].some(index => !fields['student' + index].trim());
  document.getElementById('restoreFicheStudents').hidden = !findFichePreset(fields);
  const presets = ficheLanguage === 'fr' ? FICHE_PRESETS_FR : LESSON_PRESETS;
  document.querySelectorAll('[data-fiche-subject]').forEach(button => {
    const preset = presets[button.dataset.ficheSubject];
    button.setAttribute('aria-pressed', String(fields.title === preset.title && fields.subject === preset.subject));
  });
  const cycle = FICHE_CYCLES.find(item => item.id === fields.cycle);
  const level = cycle?.levels.find(item => item.id === fields.level);
  for (const field of ['school','teacher','duration']) document.getElementById('out' + field[0].toUpperCase() + field.slice(1)).textContent = fields[field] || '____________';
  const track = FICHE_TRACKS.find(item => item.id === fields.track);
  const trackLabel = fields.track === 'all' ? ficheText().allTracks : track?.[ficheLanguage] || fields.track;
  document.getElementById('outLevel').textContent = (level?.[ficheLanguage] || '') + (fields.cycle === 'lycee' ? ' · ' + trackLabel : '');
  document.getElementById('outSessionDate').textContent = fields.sessionDate ? new Date(fields.sessionDate + 'T12:00:00').toLocaleDateString(ficheLanguage === 'fr' ? 'fr-MA' : 'ar-MA') : '____________';
  for (const [field,id] of Object.entries({subject:'outSubject',title:'outTitle',competence:'outCompetence',
    objectives:'outObjectives',pedagogy:'outPedagogy',criteria:'outCriteria',materials:'outMaterials'})) document.getElementById(id).textContent = fields[field];
  document.getElementById('outLessonTitle').textContent = fields.title;
  document.querySelectorAll('#sheetPreview .sheet-steps-table tbody tr').forEach((row,index) => {
    row.cells[1].textContent = fields['phaseDuration' + (index + 1)] || '—';
    row.cells[2].textContent = fields['step' + (index + 1)];
    row.cells[3].textContent = fields['student' + (index + 1)];
    row.cells[4].textContent = fields['assessment' + (index + 1)] + (index === 3 ? '\n' + fields.support : '');
  });
  const durations = [1,2,3,4].map(index => fields['phaseDuration' + index]);
  const total = document.getElementById('fichePhaseTotal');
  total.hidden = durations.every(value => value === '');
  const valid = durations.every(value => !value || /^\d{1,4}$/.test(value) && Number(value) <= 1440);
  const label = durations.every(value => value !== '') ? ficheText().phaseTotal : ficheText().phasePartial;
  total.textContent = valid ? `${label} : ${durations.reduce((sum,value) => sum + Number(value),0)} ${ficheText().minutes}` : ficheText().invalidPhaseDuration;
}
function cacheDraft() {
  try { sessionStorage.setItem(draftCacheKey(),JSON.stringify({id:draftId,version:draftVersion,dirty:draftDirty,fields:sheetFields()})); } catch {}
}
function updateSheet() {
  renderSheet();
  if (!sheetReady || !AccountManager.user || draftDeleting) return;
  draftDirty = true; cacheDraft(); clearTimeout(draftTimer);
  document.getElementById('draftStatus').textContent = ficheText().dirty;
  if (!draftConflict) draftTimer = setTimeout(saveDraft,900);
}
async function refreshDraftList() {
  const result = await accountRequest('/api/drafts'); const select = document.getElementById('draftSelect');
  select.replaceChildren(new Option(ficheText().newDraft,''));
  result.drafts.forEach(draft => select.add(new Option(draft.title,draft.id)));
  select.value = draftVersion ? draftId : '';
  document.getElementById('deleteDraftBtn').hidden = !draftVersion;
  document.getElementById('deleteDraftBtn').disabled = draftSaving || draftDeleting;
  return result.drafts;
}
async function saveDraft() {
  if (draftSaving || draftDeleting || draftConflict || !AccountManager.user) return false;
  clearTimeout(draftTimer); draftSaving = true;
  const fields = sheetFields(); const serialized = JSON.stringify(fields); const id = draftId;
  if (!fields.title.trim()) { draftSaving = false; document.getElementById('draftStatus').textContent = ficheText().missingTitle; return false; }
  for (let index = 1; index <= 4; index++) {
    const input = document.getElementById('inPhaseDuration' + index);
    if (!input.validity.valid || input.value && !/^\d{1,4}$/.test(input.value)) { draftSaving = false; document.getElementById('draftStatus').textContent = ficheText().invalidPhaseDuration; return false; }
  }
  document.getElementById('draftStatus').textContent = ficheText().saving; document.getElementById('saveDraftBtn').disabled = true;
  document.getElementById('deleteDraftBtn').disabled = true;
  try {
    const result = await accountRequest('/api/drafts/save',{id,version:draftVersion,fields});
    draftVersion = result.draft.version; draftDirty = JSON.stringify(sheetFields()) !== serialized;
    if (!draftDirty) { try { sessionStorage.removeItem(draftCacheKey()); } catch {} } else cacheDraft();
    document.getElementById('draftStatus').textContent = draftDirty ? ficheText().pending : ficheText().saved;
    await refreshDraftList(); return true;
  } catch (error) {
    draftDirty = true; cacheDraft(); document.getElementById('draftStatus').textContent = error.code === 'DRAFT_CONFLICT' ? ficheText().conflict : ficheText().failed;
    if (error.code === 'DRAFT_CONFLICT') { draftConflict = true; document.getElementById('draftConflictActions').hidden = false; }
    return false;
  } finally {
    draftSaving = false; document.getElementById('saveDraftBtn').disabled = false;
    document.getElementById('deleteDraftBtn').disabled = draftDeleting;
    if (draftDirty && !draftConflict && JSON.stringify(sheetFields()) !== serialized) draftTimer = setTimeout(saveDraft,900);
  }
}
async function openDraft(id) {
  if (draftDeleting) return;
  const result = await accountRequest('/api/drafts/detail?id=' + encodeURIComponent(id));
  if (draftDeleting) return;
  draftId = result.draft.id; draftVersion = result.draft.version; draftDirty = false; draftConflict = false;
  clearTimeout(draftTimer); document.getElementById('draftConflictActions').hidden = true; fillSheet(result.draft.fields);
  try { sessionStorage.removeItem(draftCacheKey()); } catch {}
  document.getElementById('draftStatus').textContent = ficheText().opened; await refreshDraftList();
}
async function loadPreset(type, save = true) {
  if (!LESSON_PRESETS[type] || draftSaving || draftDeleting) return;
  if (save && draftDirty && sheetFields().title.trim() && !await saveDraft()) return;
  if (save) { draftId = crypto.randomUUID(); draftVersion = 0; draftConflict = false; document.getElementById('draftConflictActions').hidden = true; }
  const preset = ficheLanguage === 'fr' ? FICHE_PRESETS_FR[type] : LESSON_PRESETS[type];
  const defaults = FICHE_SUBJECTS.find(item => item.id === type);
  const context = Object.fromEntries(['school','teacher','sessionDate','duration'].map(field => [field,document.getElementById(SHEET_INPUTS[field]).value]));
  if (!context.duration) context.duration = '60 ' + ficheText().minutes;
  fillSheet({ ...preset, ...context, language: ficheLanguage, cycle: defaults.cycle, level: defaults.level, track: 'all' });
  if (save) { updateSheet(); await refreshDraftList(); }
}
async function deleteCurrentDraft() {
  if (draftSaving || draftDeleting || !draftVersion || !confirm(ficheText().deleteConfirm)) return;
  clearTimeout(draftTimer); draftTimer = null;
  draftDeleting = true;
  const workspace = document.getElementById('ficheWorkspace');
  workspace.inert = true; workspace.setAttribute('aria-busy', 'true');
  document.getElementById('saveDraftBtn').disabled = true;
  document.getElementById('deleteDraftBtn').disabled = true;
  document.getElementById('draftStatus').textContent = ficheText().deleting;
  let deleted = false;
  try {
    const id = draftId;
    await accountRequest('/api/drafts/delete', {id, version:draftVersion});
    deleted = true;
    const fields = sheetFields();
    for (const field of Object.keys(SHEET_INPUTS)) if (!Object.hasOwn(FICHE_META_INPUTS, field)) fields[field] = '';
    draftId = crypto.randomUUID(); draftVersion = 0; draftDirty = false; draftConflict = false;
    document.getElementById('draftConflictActions').hidden = true;
    fillSheet(fields);
    const select = document.getElementById('draftSelect');
    [...select.options].find(option => option.value === id)?.remove(); select.value = '';
    document.getElementById('deleteDraftBtn').hidden = true;
    // Keep a clean, empty editor across reloads without saving a replacement
    // example or recovering the deleted fiche from a pending local edit.
    cacheDraft();
    document.getElementById('draftStatus').textContent = ficheText().deleted;
    await refreshDraftList();
  } catch (error) {
    document.getElementById('draftStatus').textContent = (deleted ? ficheText().deleted + ' ' : '') + error.message;
  } finally {
    draftDeleting = false;
    workspace.inert = false; workspace.removeAttribute('aria-busy');
    document.getElementById('saveDraftBtn').disabled = false;
    document.getElementById('deleteDraftBtn').disabled = false;
  }
}
document.addEventListener('DOMContentLoaded',async () => {
  initFicheLanguageControls();
  document.getElementById('restoreFicheStudents').onclick = fillMissingFicheStudentActivities;
  const column = document.querySelector('.generator-form-col');
  const addField = (container, field, numeric = false) => {
    const group = document.createElement('div'); group.className = 'form-group';
    const caption = document.createElement('label'); caption.htmlFor = SHEET_INPUTS[field]; caption.dataset.ficheLabel = field;
    const input = document.createElement(numeric ? 'input' : 'textarea'); input.id = SHEET_INPUTS[field]; input.className = 'form-control'; input.oninput = updateSheet;
    if (numeric) { input.type = 'number'; input.min = '0'; input.max = '1440'; input.step = '1'; group.classList.add('fiche-phase-duration'); }
    else { input.rows = 3; input.maxLength = 4000; }
    group.append(caption,input); container.appendChild(group);
  };
  addField(column, 'materials');
  for (let index = 1; index <= 4; index++) {
    const phase = document.createElement('fieldset'); phase.className = 'fiche-phase-editor';
    const legend = document.createElement('legend'); legend.dataset.fichePhase = String(index - 1); phase.append(legend);
    addField(phase, 'phaseDuration' + index, true);
    for (const field of ['step', 'student', 'assessment']) addField(phase, field + index);
    column.append(phase);
  }
  const presets = document.getElementById('ficheSubjectPresets');
  FICHE_SUBJECTS.forEach(item => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-outline';
    button.dataset.click = 'loadPreset'; button.dataset.args = JSON.stringify([item.id]); button.dataset.ficheSubject = item.id;
    button.setAttribute('aria-pressed', 'false'); presets.append(button);
  });
  for (const [field,id] of Object.entries(SHEET_INPUTS)) if (document.getElementById(id).tagName !== 'SELECT') document.getElementById(id).maxLength = field === 'title' || field === 'school' || field === 'teacher' ? 200 : field === 'track' || field === 'duration' ? 120 : 4000;
  fillSheet(blankFicheFields()); await AccountManager.ready;
  if (!AccountManager.user) return;
  document.getElementById('saveDraftBtn').onclick = saveDraft;
  document.getElementById('newDraftBtn').onclick = newBlankDraft;
  document.getElementById('draftSelect').onchange = async event => {
    const selected = event.target.value;
    if (draftSaving || draftDeleting) { event.target.value = draftVersion ? draftId : ''; return; }
    if (draftDirty && sheetFields().title.trim() && !await saveDraft()) { event.target.value = draftVersion ? draftId : ''; return; }
    try { if (selected) await openDraft(selected); else await newBlankDraft(); } catch (error) { document.getElementById('draftStatus').textContent = error.message; }
  };
  document.getElementById('reloadDraftBtn').onclick = async () => {
    if (draftSaving || !confirm(ficheText().reloadConfirm)) return;
    try { await openDraft(draftId); } catch (error) { document.getElementById('draftStatus').textContent = error.message; }
  };
  document.getElementById('copyDraftBtn').onclick = async () => {
    if (draftSaving) return;
    draftId = crypto.randomUUID(); draftVersion = 0; draftConflict = false; document.getElementById('draftConflictActions').hidden = true; await saveDraft();
  };
  document.getElementById('deleteDraftBtn').onclick = deleteCurrentDraft;
  try {
    const pending = JSON.parse(sessionStorage.getItem(draftCacheKey()) || 'null');
    const drafts = await refreshDraftList();
    if (pending?.id && pending.fields) { draftId = pending.id; draftVersion = pending.version; fillSheet(pending.fields); draftDirty = pending.dirty !== false; document.getElementById('draftStatus').textContent = draftDirty ? ficheText().recovered : ficheText().newDraft; await refreshDraftList(); }
    else if (drafts.length) await openDraft(drafts[0].id);
  } catch (error) { document.getElementById('draftStatus').textContent = error.message; }
  sheetReady = true;
});
window.addEventListener('beforeunload',event => { if (draftDirty || draftSaving || draftDeleting) { event.preventDefault(); event.returnValue = ''; } });

