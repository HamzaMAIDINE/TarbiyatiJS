let activeMapKey = 'map-theories';
let currentLayoutMode = 'map';
const mapSelections = new Map();
const mapDisclosureStates = new Map();
const viewedMaps = new Set();
let mapResizeObserver = null;
const mindmapBranches = new Map(MINDMAPS_DATA.flatMap(map => map.root.branches.map(branch => [branch.id, { map, branch }])));

const mapIcons = {
  book: '<path d="M12 5v16M12 5C9 3 5 3 2 4v15c3-1 7-1 10 2 3-3 7-3 10-2V4c-3-1-7-1-10 1Z"/>',
  effects: '<path d="m12 3 9 18H3zM12 9v5m0 3h.01"/>',
  timeline: '<path d="M5 3v18M5 6h5m-5 6h5m-5 6h5M13 4h8v4h-8zm0 6h8v4h-8zm0 6h8v4h-8z"/>',
  evaluation: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="m8 9 2 2 5-5M8 15h8m-8 3h5"/>'
};
function mapIcon(name, size = 21) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${mapIcons[name] || mapIcons.book}</svg>`;
}
function escapeMapText(value) { return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]); }
function normalizeMapText(value) { return String(value).toLowerCase().normalize('NFKC').replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآ]/g, 'ا').trim(); }
function mapBranchMatches(branch, query) {
  return !query || normalizeMapText([
    branch.title, branch.term, branch.keyword, branch.tagline, branch.year || '', branch.summary, branch.memory,
    ...branch.details.map(item => `${item.label} ${item.text}`),
    branch.example.situation, branch.example.reading, branch.example.action,
    branch.confusion, branch.recall.question, branch.recall.answer,
    ...branch.related.map(link => `${link.relation} ${mindmapBranches.get(link.branchId).branch.title}`)
  ].join(' ')).includes(query);
}
function saveMapDisclosures() {
  document.querySelectorAll('details[data-state-key]').forEach(detail => mapDisclosureStates.set(detail.dataset.stateKey, DisclosureMotion.isDetailsOpen(detail)));
}
function restoreMapDisclosures() {
  document.querySelectorAll('details[data-state-key]').forEach(detail => {
    if (mapDisclosureStates.has(detail.dataset.stateKey)) detail.open = mapDisclosureStates.get(detail.dataset.stateKey);
  });
}
function toggleMindmapDisclosure(detail, open) {
  if (open && detail.matches('.map-study-branch')) collapseAllBranches();
  DisclosureMotion.setDetailsOpen(detail, open, { scroll: open });
  mapDisclosureStates.set(detail.dataset.stateKey, open);
}
function renderMapLibrary() {
  const focusedMapId = document.activeElement?.closest('#mindmapLibrary [data-map-id]')?.dataset.mapId;
  const progress = ProgressManager.getData();
  document.getElementById('mindmapLibrary').innerHTML = MINDMAPS_DATA.map(map => `
    <button type="button" class="map-library-button" data-map-id="${map.id}" aria-pressed="${map.id === activeMapKey}" data-click="switchMap" data-args="[&quot;${map.id}&quot;]">
      <span class="map-library-icon">${mapIcon(map.icon)}</span>
      <span class="map-library-copy"><strong>${escapeMapText(map.shortTitle)}</strong><small>${map.root.branches.length} ${map.id === 'map-effects' ? 'أثراً ديداكتيكياً' : 'فروع معرفية'}</small></span>
      ${progress.mindmapsViewed.includes(map.id) ? '<span class="map-library-visited" aria-label="سبق استكشافها">✓</span>' : ''}
    </button>`).join('');
  if (focusedMapId) document.querySelector(`#mindmapLibrary [data-map-id="${focusedMapId}"]`)?.focus({ preventScroll: true });
}
function switchMap(id, branchId) {
  const map = MINDMAPS_DATA.find(map => map.id === id);
  if (!map || branchId && !map.root.branches.some(branch => branch.id === branchId)) return false;
  saveMapDisclosures();
  activeMapKey = id;
  if (branchId) {
    mapSelections.set(id, branchId);
    currentLayoutMode = 'map';
    document.getElementById('mapSearchInput').value = '';
  }
  history.replaceState(null, '', `#${id}${branchId ? '/' + branchId : ''}`);
  renderMapLibrary();
  renderCurrentMindmap();
  if (branchId) {
    const panel = document.getElementById('selectedMapBranch');
    panel.setAttribute('tabindex', '-1');
    panel.focus({ preventScroll: true });
    DisclosureMotion.scrollToStart(panel, () => activeMapKey === id && mapSelections.get(id) === branchId);
  }
  return true;
}
function openMindmapFromHash() {
  let parts;
  try { parts = decodeURIComponent(location.hash.slice(1)).split('/'); } catch { return false; }
  if (parts.length > 2) return false;
  return switchMap(parts[0], parts[1]);
}
function setMindmapLayout(mode) {
  if (!['map', 'study', 'recall'].includes(mode)) return;
  saveMapDisclosures();
  currentLayoutMode = mode;
  renderCurrentMindmap();
}
function syncMindmapLayoutButtons() {
  document.querySelectorAll('[data-map-view]').forEach(button => {
    const active = button.dataset.mapView === currentLayoutMode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}
function branchReadingHTML(map, branch) {
  const index = map.root.branches.indexOf(branch);
  return `<article class="map-branch-reading" aria-label="شرح ${escapeMapText(branch.title)}">
    <div class="map-branch-heading"><div><span class="eyebrow">الفرع ${index + 1} · ${escapeMapText(branch.keyword)}</span><h3>${escapeMapText(branch.title)}</h3><small dir="auto">${escapeMapText(branch.term || '')}</small></div><span class="card-badge">${escapeMapText(branch.year || branch.keyword)}</span></div>
    <p class="map-branch-summary">${escapeMapText(branch.summary)}</p>
    <div class="map-branch-sections"><div><h4>افهم الفكرة</h4><dl class="map-facts">${branch.details.map(detail => `<div class="map-fact"><dt>${escapeMapText(detail.label)}</dt><dd>${escapeMapText(detail.text)}</dd></div>`).join('')}</dl></div>
      <div class="map-example"><h4>مثال تعليمي للتوضيح</h4><p>${escapeMapText(branch.example.situation)}</p><h4>كيف نقرأ المثال؟</h4><p>${escapeMapText(branch.example.reading)}</p><h4>ما الذي يفيدك في الممارسة؟</h4><p>${escapeMapText(branch.example.action)}</p></div>
    </div>
    <div class="map-confusion"><h4>ميز بين المفاهيم</h4><p>${escapeMapText(branch.confusion)}</p></div>
    <aside class="map-relations" aria-label="علاقات هذا المفهوم"><h4>اربط الفكرة بمفهوم آخر</h4><ul>${branch.related.map(link => {
      const target = mindmapBranches.get(link.branchId);
      return `<li><a href="mindmaps.html#${target.map.id}/${target.branch.id}">${escapeMapText(target.branch.title)}</a><p>${escapeMapText(link.relation)}</p></li>`;
    }).join('')}</ul></aside>
    <div class="map-branch-memory"><strong>مفتاح مقترح للتذكر:</strong> ${escapeMapText(branch.memory)}</div>
    <details class="map-recall-check" data-state-key="${map.id}:${branch.id}:check"><summary>سؤال للاسترجاع: ${escapeMapText(branch.recall.question)}</summary><p>${escapeMapText(branch.recall.answer)}</p></details>
    <div class="map-reading-footer"><a class="text-link" href="modules.html#${branch.sectionId}">تعمق في شرح هذا المحور ←</a><a class="text-link" href="quiz.html">طبق فهمك في الاختبارات ←</a></div>
  </article>`;
}
function renderCurrentMindmap() {
  saveMapDisclosures();
  const map = MINDMAPS_DATA.find(item => item.id === activeMapKey);
  const host = document.getElementById('mindmapViewHost');
  if (!map || !host) return;
  syncMindmapLayoutButtons();
  const query = normalizeMapText(document.getElementById('mapSearchInput').value);
  const branches = map.root.branches.filter(branch => mapBranchMatches(branch, query));
  const searchStatus = document.getElementById('mindmapSearchStatus');
  searchStatus.hidden = !query;
  searchStatus.textContent = branches.length ? `${branches.length} من ${map.root.branches.length} فروع تطابق بحثك في الخريطة الحالية` : 'لا توجد نتائج في هذه الخريطة. جرب كلمة أخرى أو اختر خريطة مختلفة.';
  const selected = branches.find(branch => branch.id === mapSelections.get(map.id)) || branches[0];
  if (selected) mapSelections.set(map.id, selected.id);
  host.innerHTML = `<div class="map-heading"><div><h2>${escapeMapText(map.title)}</h2><p>${escapeMapText(map.description)}</p></div><span class="card-badge">${map.root.branches.length} فروع</span></div><div class="map-memory-strip"><strong>مفتاح مقترح للتذكر</strong>${escapeMapText(map.memory)}</div>`;
  if (!branches.length) {
    host.insertAdjacentHTML('beforeend', '<div class="empty-library"><h3>لا توجد فروع مطابقة</h3><p>ابحث عن كلمة أخرى، أو اعرض الخريطة كاملة.</p><button type="button" class="btn btn-outline btn-sm" data-click="clearMindmapSearch">مسح البحث</button></div>');
  } else if (currentLayoutMode === 'map') {
    const rows = Math.ceil(branches.length / 2);
    host.insertAdjacentHTML('beforeend', `<div class="map-diagram" style="--map-rows:${rows}"><svg class="map-connections" aria-hidden="true"></svg><div class="map-central-node">${mapIcon(map.icon, 25)}<h3>${escapeMapText(map.root.name)}</h3><p>${escapeMapText(map.root.prompt)}</p></div>${branches.map((branch, index) => `<button type="button" class="map-node" data-branch-id="${branch.id}" data-tone="${branch.tone}" data-selected="${branch.id === selected.id}" aria-pressed="${branch.id === selected.id}" aria-controls="selectedMapBranch" style="--node-column:${index % 2 === 0 ? 1 : 3};--node-row:${Math.floor(index / 2) + 1}" data-click="selectMindmapBranch" data-args="[&quot;${branch.id}&quot;]"><span class="map-node-top"><span>${String(map.root.branches.indexOf(branch) + 1).padStart(2, '0')}</span><span class="map-node-word">${escapeMapText(branch.year || branch.keyword)}</span></span><strong>${escapeMapText(branch.title)}</strong><span>${escapeMapText(branch.tagline)}</span></button>`).join('')}</div><p class="map-navigation-hint">اختر فرعاً لقراءة شرحه ومثاله أسفل الخريطة.</p><div id="selectedMapBranch">${branchReadingHTML(map, selected)}</div>`);
  } else if (currentLayoutMode === 'study') {
    host.insertAdjacentHTML('beforeend', `<div class="map-study-actions"><span>فكرة، مثال، تمييز، ثم سؤال للاسترجاع.</span><div><button class="btn btn-outline btn-sm" type="button" data-click="expandAllBranches">فتح الفروع</button><button class="btn btn-outline btn-sm" type="button" data-click="collapseAllBranches">طي الفروع</button></div></div>${branches.map(branch => `<details class="map-study-branch" data-state-key="${map.id}:${branch.id}:study" ${branch.id === selected.id ? 'open' : ''}><summary>${escapeMapText(branch.title)}<span>${escapeMapText(branch.keyword)} · ${escapeMapText(branch.tagline)}</span></summary>${branchReadingHTML(map, branch)}</details>`).join('')}`);
  } else {
    host.insertAdjacentHTML('beforeend', `<p class="map-recall-intro">أجب بكلماتك قبل فتح الإجابة. استخدم مفتاح التذكر للمراجعة، ثم حاول تفسير الفكرة بمثال مختلف.</p><div class="map-recall-grid">${branches.map(branch => `<article class="map-recall-card"><span class="eyebrow">${escapeMapText(branch.title)}</span><h3>${escapeMapText(branch.recall.question)}</h3><details data-state-key="${map.id}:${branch.id}:recall"><summary>اكشف الإجابة وتحقق من فهمك</summary><p>${escapeMapText(branch.recall.answer)}</p><p><strong>مفتاح التذكر:</strong> ${escapeMapText(branch.memory)}</p><a class="text-link" href="modules.html#${branch.sectionId}">راجع شرح هذا المحور ←</a></details></article>`).join('')}</div>`);
  }
  restoreMapDisclosures();
  DisclosureMotion.enhanceDetails(host, { onToggle: toggleMindmapDisclosure });
  document.getElementById('mindmapSources').innerHTML = map.sources.map(source => `<a href="${escapeMapText(source.url)}" ${source.url.startsWith('http') || source.url.includes('.pdf') ? 'target="_blank" rel="noopener noreferrer"' : ''}>${escapeMapText(source.label)}</a>`).join('');
  mapResizeObserver?.disconnect();
  const diagram = document.querySelector('.map-diagram');
  if (diagram) {
    mapResizeObserver = new ResizeObserver(drawMindmapConnections);
    mapResizeObserver.observe(diagram);
    requestAnimationFrame(drawMindmapConnections);
    document.fonts.ready.then(drawMindmapConnections);
  }
  if (!viewedMaps.has(map.id) && AccountManager.user) {
    viewedMaps.add(map.id);
    ProgressManager.recordMindmap(map.id).then(saved => { if (!saved) viewedMaps.delete(map.id); });
  }
}
function selectMindmapBranch(id) {
  const map = MINDMAPS_DATA.find(item => item.id === activeMapKey);
  const branch = map.root.branches.find(branch => branch.id === id);
  const panel = document.getElementById('selectedMapBranch');
  const node = document.querySelector(`.map-node[data-branch-id="${id}"]`);
  if (!branch || !panel || !node) return;
  saveMapDisclosures();
  mapSelections.set(map.id, id);
  history.replaceState(null, '', `#${map.id}/${id}`);
  document.querySelectorAll('.map-node').forEach(item => {
    const selected = item === node;
    item.dataset.selected = String(selected);
    item.setAttribute('aria-pressed', String(selected));
  });
  panel.innerHTML = branchReadingHTML(map, branch);
  restoreMapDisclosures();
  DisclosureMotion.enhanceDetails(panel, { onToggle: toggleMindmapDisclosure });
  drawMindmapConnections();
  node.focus({ preventScroll: true });
  DisclosureMotion.scrollToStart(panel, () => mapSelections.get(map.id) === id);
}
function drawMindmapConnections() {
  const diagram = document.querySelector('.map-diagram');
  if (!diagram) return;
  const svg = diagram.querySelector('.map-connections');
  const box = diagram.getBoundingClientRect();
  const root = diagram.querySelector('.map-central-node').getBoundingClientRect();
  if (!box.width || !box.height) return;
  svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
  svg.replaceChildren();
  const mobile = window.matchMedia('(max-width: 580px)').matches;
  const wide = window.matchMedia('(min-width: 1051px)').matches;
  for (const node of diagram.querySelectorAll('.map-node')) {
    const rect = node.getBoundingClientRect();
    let d;
    if (wide) {
      const right = rect.left > root.left;
      const startX = (right ? root.right : root.left) - box.left;
      const startY = root.top - box.top + root.height / 2;
      const endX = (right ? rect.left : rect.right) - box.left;
      const endY = rect.top - box.top + rect.height / 2;
      const midX = (startX + endX) / 2;
      d = `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;
    } else if (mobile) {
      const startX = root.left - box.left + root.width / 2;
      const startY = root.bottom - box.top;
      const spineX = box.width - 5;
      const endX = rect.right - box.left;
      const endY = rect.top - box.top + rect.height / 2;
      d = `M ${startX} ${startY} V ${startY + 10} H ${spineX} V ${endY} H ${endX}`;
    } else {
      const startX = root.left - box.left + root.width / 2;
      const startY = root.bottom - box.top;
      const endX = rect.left - box.left + rect.width / 2;
      const endY = rect.top - box.top;
      d = `M ${startX} ${startY} V ${startY + 12} H ${endX} V ${endY}`;
    }
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.setAttribute('d', d); line.setAttribute('fill', 'none');
    line.setAttribute('stroke', getComputedStyle(node).getPropertyValue('--branch-color').trim());
    line.setAttribute('stroke-width', node.dataset.selected === 'true' ? '1.8' : '1.2');
    line.setAttribute('opacity', node.dataset.selected === 'true' ? '.9' : '.4');
    svg.appendChild(line);
  }
}
function filterMapDetails() { renderCurrentMindmap(); }
function clearMindmapSearch() { document.getElementById('mapSearchInput').value = ''; renderCurrentMindmap(); document.getElementById('mapSearchInput').focus(); }
function expandAllBranches() {
  document.querySelectorAll('.map-study-branch').forEach(detail => { DisclosureMotion.setDetailsOpen(detail, true); mapDisclosureStates.set(detail.dataset.stateKey, true); });
  const first = document.querySelector('.map-study-branch');
  if (first) DisclosureMotion.scrollToStart(first, () => DisclosureMotion.isDetailsOpen(first));
}
function collapseAllBranches() { document.querySelectorAll('.map-study-branch').forEach(detail => { DisclosureMotion.setDetailsOpen(detail, false); mapDisclosureStates.set(detail.dataset.stateKey, false); }); }
function prepareMindmapPrint() { return AcademicPrint.prepare('mindmap'); }
function restoreMindmapPrint() { AcademicPrint.cleanup(); }
function printMindmap() { return AcademicPrint.print('mindmap'); }
window.addEventListener('resize', drawMindmapConnections);
new MutationObserver(drawMindmapConnections).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
window.addEventListener('learning-progress', renderMapLibrary);
window.addEventListener('hashchange', openMindmapFromHash);
document.addEventListener('DOMContentLoaded', async () => {
  await AccountManager.ready;
  if (!AccountManager.user) return;
  if (!openMindmapFromHash()) {
    renderMapLibrary();
    renderCurrentMindmap();
  }
});
