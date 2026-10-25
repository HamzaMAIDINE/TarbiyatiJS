'use strict';
const FICHE_META_INPUTS = { language: 'inLanguage', cycle: 'inCycle', level: 'inLevel', track: 'inTrack', school: 'inSchool', teacher: 'inTeacher', sessionDate: 'inSessionDate', duration: 'inDuration' };
let ficheLanguage = 'ar';
function ficheText() { return FICHE_TEXT[ficheLanguage]; }
function normalizeFicheFields(fields) {
  const match = findFichePreset(fields);
  const restored = { ...fields };
  // Old servers did not store student fields. Restore only absent fields from an
  // exact built-in lesson match; an explicitly empty field stays editable.
  if (match) for (let index = 1; index <= 4; index++) {
    const field = 'student' + index;
    if (!Object.hasOwn(fields, field)) restored[field] = match.preset[field];
  }
  const inferred = match?.subject.cycle || (/تأهيلي|qualifiant/.test(fields.subject || '') ? 'lycee' : /إعدادي|collégial/.test(fields.subject || '') ? 'college' : 'primary');
  const cycle = fields.cycle === '' ? null : FICHE_CYCLES.find(item => item.id === fields.cycle) || FICHE_CYCLES.find(item => item.id === inferred);
  const level = !cycle || fields.level === '' ? '' : cycle.levels.find(item => item.id === fields.level)?.id || (match?.subject.cycle === cycle.id ? match.subject.level : { primary: 'p6', college: 'c2', lycee: 'tc' }[cycle.id]);
  return { ...restored, language: fields.language === 'fr' ? 'fr' : fields.language === 'ar' ? 'ar' : match?.language || 'ar', cycle: cycle?.id || '', level,
    track: !cycle ? '' : cycle.id === 'lycee' ? fields.track || 'all' : 'all', school: fields.school || '', teacher: fields.teacher || '',
    sessionDate: fields.sessionDate || '', duration: fields.duration || '' };
}
function setFicheOptions(id, options, selected, placeholder = false) {
  const select = document.getElementById(id);
  if (placeholder) options = [{ value: '', label: ficheText().choose }, ...options];
  select.replaceChildren(...options.map(option => new Option(option.label, option.value)));
  if (selected && !options.some(option => option.value === selected)) select.add(new Option(selected, selected));
  select.value = selected || options[0]?.value || '';
}
function populateFicheSelectors(fields) {
  setFicheOptions('inCycle', FICHE_CYCLES.map(item => ({ value: item.id, label: item[ficheLanguage] })), fields.cycle, true);
  const cycle = FICHE_CYCLES.find(item => item.id === fields.cycle);
  setFicheOptions('inLevel', (cycle?.levels || []).map(item => ({ value: item.id, label: item[ficheLanguage] })), fields.level, true);
  populateFicheTracks(fields.level, fields.track);
  for (const field of ['pedagogy', 'support']) setFicheOptions(SHEET_INPUTS[field], FICHE_OPTIONS[ficheLanguage][field].map(text => ({ value: text, label: text })), fields[field], true);
  document.getElementById('ficheTrackField').hidden = cycle?.id !== 'lycee';
}
function populateFicheTracks(level, selected = 'all') {
  const select = document.getElementById('inTrack');
  select.replaceChildren(new Option('ALL', 'all'));
  if (selected === '') select.prepend(new Option(ficheText().choose, ''));
  for (const [group, label] of Object.entries(FICHE_TRACK_GROUPS[ficheLanguage])) {
    const tracks = FICHE_TRACKS.filter(item => item.group === group && item.levels.includes(level));
    if (!tracks.length) continue;
    const optgroup = document.createElement('optgroup'); optgroup.label = label;
    optgroup.append(...tracks.map(item => new Option(item[ficheLanguage], item.id)));
    select.append(optgroup);
  }
  // Preserve text entered in older drafts; unknown text is never discarded.
  if (selected && selected !== 'all' && ![...select.options].some(option => option.value === selected)) {
    const track = FICHE_TRACKS.find(item => item.id === selected);
    select.add(new Option(track?.[ficheLanguage] || selected, selected));
  }
  select.value = selected ?? 'all';
}
function applyFicheLanguageUI() {
  const text = ficheText();
  const workspace = document.getElementById('ficheWorkspace');
  workspace.lang = ficheLanguage; workspace.dir = ficheLanguage === 'fr' ? 'ltr' : 'rtl';
  const preview = document.getElementById('sheetPreview'); preview.lang = ficheLanguage; preview.dir = workspace.dir;
  document.querySelectorAll('[data-fiche-text]').forEach(element => element.textContent = text[element.dataset.ficheText]);
  document.querySelectorAll('[data-fiche-label]').forEach(element => element.textContent = text[element.dataset.ficheLabel] + ' :');
  document.getElementById('inDuration').placeholder = text.durationPlaceholder;
  const logo = document.getElementById('ficheMinistryLogo');
  logo.alt = text.logoAlt;
  const defaultDraft = document.querySelector('#draftSelect option[value=""]'); if (defaultDraft) defaultDraft.textContent = text.newDraft;
  for (const [index, row] of [...document.querySelectorAll('#sheetPreview .sheet-steps-table tbody tr')].entries()) row.cells[0].textContent = `${index + 1}. ${text.phases[index]}`;
  document.querySelectorAll('[data-fiche-phase]').forEach(element => {
    const index = Number(element.dataset.fichePhase); element.textContent = `${index + 1}. ${text.phases[index]}`;
  });
  document.querySelectorAll('[data-fiche-subject]').forEach(button => {
    button.textContent = FICHE_SUBJECTS.find(item => item.id === button.dataset.ficheSubject)[ficheLanguage];
  });
}
function changeFicheLanguage() {
  const nextLanguage = document.getElementById('inLanguage').value;
  if (nextLanguage === ficheLanguage) return;
  const fields = sheetFields();
  const oldPresets = ficheLanguage === 'fr' ? FICHE_PRESETS_FR : LESSON_PRESETS;
  const newPresets = nextLanguage === 'fr' ? FICHE_PRESETS_FR : LESSON_PRESETS;
  for (const field of Object.keys(SHEET_INPUTS).filter(field => !Object.hasOwn(FICHE_META_INPUTS, field))) {
    if (!fields[field]) continue;
    for (const key of Object.keys(oldPresets)) {
      if (fields[field] === oldPresets[key][field]) { fields[field] = newPresets[key][field]; break; }
    }
  }
  for (const field of ['pedagogy', 'support']) {
    const index = FICHE_OPTIONS[ficheLanguage][field].indexOf(fields[field]);
    if (index >= 0) fields[field] = FICHE_OPTIONS[nextLanguage][field][index];
  }
  if (fields.duration === '60 ' + FICHE_TEXT[ficheLanguage].minutes) fields.duration = '60 ' + FICHE_TEXT[nextLanguage].minutes;
  fields.language = nextLanguage; fillSheet(fields); updateSheet();
}
function initFicheLanguageControls() {
  document.getElementById('inLanguage').onchange = changeFicheLanguage;
  document.getElementById('inCycle').onchange = () => {
    const fields = sheetFields();
    fields.level = FICHE_CYCLES.find(item => item.id === fields.cycle)?.levels[0].id || '';
    fields.track = fields.cycle ? 'all' : '';
    fillSheet(fields); updateSheet();
  };
  document.getElementById('inLevel').onchange = () => {
    const fields = sheetFields();
    const track = FICHE_TRACKS.find(item => item.id === fields.track);
    if (track && !track.levels.includes(fields.level)) fields.track = 'all';
    populateFicheTracks(fields.level, fields.track); updateSheet();
  };
  for (const [field, id] of Object.entries(FICHE_META_INPUTS)) {
    if (['language', 'cycle', 'level'].includes(field)) continue;
    const input = document.getElementById(id);
    input.addEventListener(input.tagName === 'SELECT' || input.type === 'date' ? 'change' : 'input', updateSheet);
  }
}
