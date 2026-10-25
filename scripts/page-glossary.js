'use strict';
let activeCategory = 'all';

function normalizeGlossaryText(value) {
  return String(value).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/\u0640/g, '').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
const glossaryEntries = GLOSSARY_DATA.map(item => ({
  item, searchable: normalizeGlossaryText([item.termAr, item.termFr, item.def, item.example, item.category, ...item.tags].join(' '))
}));
function glossaryElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function renderGlossaryCategories() {
  const container = document.getElementById('glossaryCatPills');
  const select = document.getElementById('glossaryCategorySelect'); select.replaceChildren();
  container.replaceChildren();
  for (const category of ['all', ...new Set(GLOSSARY_DATA.map(item => item.category))]) {
    const count = category === 'all' ? GLOSSARY_DATA.length : GLOSSARY_DATA.filter(item => item.category === category).length;
    const button = glossaryElement('button', 'btn btn-sm g-pill', (category === 'all' ? 'الكل' : category) + ' (' + count + ')');
    button.type = 'button'; button.dataset.category = category;
    const option = glossaryElement('option', '', button.textContent); option.value = category; select.appendChild(option);
    button.onclick = () => filterGlossaryCat(category);
    container.appendChild(button);
  }
  updateGlossaryCategories();
}
function updateGlossaryCategories() {
  document.getElementById('glossaryCategorySelect').value = activeCategory;
  document.querySelectorAll('.g-pill').forEach(button => {
    const selected = button.dataset.category === activeCategory;
    button.className = 'btn btn-sm ' + (selected ? 'btn-primary' : 'btn-outline') + ' g-pill';
    button.setAttribute('aria-pressed', String(selected));
  });
}
function filterGlossaryCat(category) {
  activeCategory = category;
  updateGlossaryCategories();
  renderGlossary();
}
function clearGlossaryFilters() {
  document.getElementById('glossarySearchInput').value = '';
  filterGlossaryCat('all');
  document.getElementById('glossarySearchInput').focus();
}
function renderGlossary() {
  const words = normalizeGlossaryText(document.getElementById('glossarySearchInput').value).split(' ').filter(Boolean);
  const filtered = glossaryEntries.filter(({item, searchable}) =>
    (activeCategory === 'all' || item.category === activeCategory) && words.every(word => searchable.includes(word)));
  const grid = document.getElementById('glossaryGrid'); grid.replaceChildren();
  document.getElementById('termsCountBadge').textContent = filtered.length + ' من ' + GLOSSARY_DATA.length + ' مصطلح';
  document.getElementById('glossaryReset').hidden = activeCategory === 'all' && !document.getElementById('glossarySearchInput').value.trim();
  if (!filtered.length) {
    const empty = glossaryElement('div', 'glossary-empty');
    empty.append(glossaryElement('h2', '', 'لا توجد مصطلحات مطابقة'),
      glossaryElement('p', '', 'جرّب كلمة أخرى بالعربية أو الفرنسية، أو أعد عرض جميع المصطلحات.'));
    const reset = glossaryElement('button', 'btn btn-outline btn-sm', 'عرض جميع المصطلحات');
    reset.type = 'button'; reset.onclick = clearGlossaryFilters; empty.appendChild(reset);
    grid.appendChild(empty); return;
  }
  const fragment = document.createDocumentFragment();
  filtered.forEach(({item}) => {
    const card = glossaryElement('article', 'card glossary-card');
    const header = glossaryElement('div', 'card-header');
    header.appendChild(glossaryElement('span', 'card-badge', item.category));
    const french = glossaryElement('p', 'glossary-term-fr', item.termFr); french.lang = 'fr'; french.dir = 'ltr';
    card.append(header, glossaryElement('h2', 'glossary-term-ar', item.termAr), french,
      glossaryElement('p', 'glossary-definition', item.def));
    const tags = glossaryElement('div', 'glossary-tags');
    item.tags.forEach(tag => tags.appendChild(glossaryElement('span', '', tag)));
    card.appendChild(tags);
    const example = glossaryElement('details', 'glossary-example');
    example.append(glossaryElement('summary', '', 'مثال توضيحي'), glossaryElement('p', '', item.example));
    card.appendChild(example);
    const footer = glossaryElement('div', 'card-footer');
    const copy = glossaryElement('button', 'btn btn-sm btn-outline', 'نسخ المصطلح');
    copy.type = 'button'; copy.dataset.termCopy = ''; copy.setAttribute('aria-label', 'نسخ مصطلح ' + item.termAr);
    copy.onclick = () => copyTerm(item.termAr, item.termFr, item.def, item.example);
    const lesson = glossaryElement('a', 'text-link', 'المجزوءة ' + item.moduleId.slice(4) + ' ←');
    lesson.href = 'modules.html#' + item.moduleId; lesson.setAttribute('aria-label', 'راجع المجزوءة المرتبطة بمصطلح ' + item.termAr);
    footer.append(copy, lesson); card.appendChild(footer);
    fragment.appendChild(card);
  });
  grid.appendChild(fragment);
}
async function copyTerm(ar, fr, def, example) {
  const text = ar + ' (' + fr + '):\n' + def + (example ? '\nمثال توضيحي: ' + example : '');
  try {
    await navigator.clipboard.writeText(text);
    showToast('تم نسخ المصطلح والتعريف والمثال.');
  } catch { showToast('تعذر النسخ. تحقق من سماح المتصفح بالوصول للحافظة.'); }
}
document.addEventListener('DOMContentLoaded', () => {
  renderGlossaryCategories();
  renderGlossary();
});
document.getElementById('glossaryReset').addEventListener('click', clearGlossaryFilters);
document.getElementById('glossaryCategorySelect').addEventListener('change', event => filterGlossaryCat(event.target.value));
