/* Dedicated print documents preserve the reader's filters, drafts, and disclosures. */
'use strict';

const AcademicPrint = (() => {
  let previousTitle = null;
  let printing = false;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const date = () => new Intl.DateTimeFormat('ar-MA', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date());
  const number = value => String(value).padStart(2, '0');
  const header = (title, kind, subtitle = '', marker = '') => `
    <header class="academic-header"><div class="academic-masthead"><strong>تربيتي <bdi lang="en">Tarbiyati</bdi></strong><span>علوم التربية والديداكتيك</span><time>${escape(date())}</time></div>
    <div class="academic-title"><div class="academic-title-copy"><span class="academic-eyebrow">${escape(kind)}</span><h1>${escape(title)}</h1>${subtitle ? `<p>${escape(subtitle)}</p>` : ''}</div>${marker ? `<span class="academic-section-number" aria-hidden="true">${escape(marker)}</span>` : ''}</div></header>`;
  function clone(element) {
    const copy = element.cloneNode(true);
    [copy, ...copy.querySelectorAll('*')].forEach(node => {
      node.removeAttribute('id'); node.removeAttribute('style'); node.removeAttribute('hidden');
      node.removeAttribute('aria-hidden'); node.removeAttribute('aria-labelledby'); node.removeAttribute('aria-controls');
      for (const attribute of [...node.attributes]) {
        if (attribute.name.startsWith('data-click') || attribute.name.startsWith('on')) node.removeAttribute(attribute.name);
      }
    });
    copy.querySelectorAll('button, input, select, textarea, .reading-toolbar, .map-reading-footer').forEach(node => node.remove());
    copy.querySelectorAll('details').forEach(detail => {
      const section = document.createElement('section'); section.className = detail.className;
      for (const child of [...detail.childNodes]) {
        if (child.nodeName === 'SUMMARY') {
          const heading = document.createElement('h4'); heading.append(...child.childNodes); section.append(heading);
        } else section.append(child);
      }
      detail.replaceWith(section);
    });
    return copy;
  }
  function lesson() {
    const sheet = document.getElementById('sheetPreview');
    if (!sheet) return null;
    const text = ficheText();
    const title = document.getElementById('outTitle').textContent || text.documentKind;
    // The visible fiche is the single source for both preview and PDF.
    const body = clone(sheet); body.className = 'fiche-sheet fiche-print-sheet';
    if (document.getElementById('fichePhaseTotal').hidden) body.querySelector('.fiche-phase-total')?.remove();
    body.querySelector('.sheet-steps-wrap')?.removeAttribute('tabindex');
    for (const row of body.querySelectorAll('tr')) {
      if (row.textContent.length > 600 || row.textContent.split('\n').length > 12) row.classList.add('academic-long-row');
    }
    // A real table header reserves its own space on every printed page,
    // including pages where the nested activities table continues.
    const layout = document.createElement('table'); layout.className = 'fiche-print-layout';
    layout.setAttribute('role', 'presentation');
    const headerCell = layout.createTHead().insertRow().insertCell();
    const headerSheet = document.createElement('div'); headerSheet.className = 'fiche-sheet';
    headerSheet.lang = body.lang; headerSheet.dir = body.dir;
    headerSheet.append(body.querySelector('.fiche-page-header')); headerCell.append(headerSheet);
    layout.createTBody().insertRow().insertCell().append(body);
    return { title: text.filePrefix + ' - ' + title, language: ficheLanguage, branded: false, content: layout };
  }
  function fitFicheHeader(root) {
    if (root.dataset.kind !== 'lesson') return;
    const pageHeader = root.querySelector('.fiche-page-header');
    const metadata = pageHeader.querySelector('.sheet-context-grid');
    if (!metadata) return;
    const rootStyle = root.getAttribute('style'), headerStyle = pageHeader.getAttribute('style');
    root.style.cssText = 'display:block!important;position:fixed;left:-10000px;top:0;visibility:hidden';
    pageHeader.style.cssText = 'position:fixed;width:267mm';
    const heightMm = pageHeader.getBoundingClientRect().height * 25.4 / 96;
    if (rootStyle === null) root.removeAttribute('style'); else root.setAttribute('style', rootStyle);
    if (headerStyle === null) pageHeader.removeAttribute('style'); else pageHeader.setAttribute('style', headerStyle);
    // Chromium repeats table headers only below a quarter of the page area.
    // Keep unusually long classroom details in the body so the bilingual
    // logo and document title still repeat without clipping any field.
    if (heightMm > 44) root.querySelector('.fiche-print-sheet').prepend(metadata);
  }
  function resources() {
    const cards = [...document.querySelectorAll('#resourcesListContainer .res-card')];
    if (!cards.length) throw new Error('اختر مراجع مطابقة قبل إعداد ملف الطباعة.');
    const body = document.createElement('div');
    if (cards.length > 1) {
      const cover = document.createElement('section'); cover.className = 'academic-contents';
      const category = RESOURCES_DATA.categories.find(item => item.id === activeCategory)?.name.replace(/^[^\p{L}\p{N}]+/u, '') || '';
      const query = document.getElementById('resSearchInput').value.trim();
      cover.innerHTML = header('ملف المراجع التربوية', 'وثيقة للمطالعة والمراجعة', category) +
        `<p class="academic-intro">${cards.length} مراجع مختارة${query ? ' · البحث: ' + escape(query) : ''}. يتضمن الملف التفاصيل الكاملة للمراجع المعروضة.</p>` +
        '<h2>دليل المحتويات</h2><ol class="academic-contents-list">' + cards.map((card, index) =>
          `<li><a href="#print-resource-${index + 1}"><span>${escape(card.querySelector('h3').textContent)}</span></a></li>`).join('') + '</ol>';
      body.append(cover);
    }
    cards.forEach((card, index) => {
      const section = document.createElement('section');
      section.id = `print-resource-${index + 1}`;
      section.className = 'academic-resource' + (card.querySelector('.matrix-table') ? ' academic-landscape' : '');
      const title = card.querySelector('h3').textContent;
      const type = card.querySelector('.res-card-header > span')?.textContent || 'مرجع تربوي';
      section.innerHTML = header(title, type, card.querySelector('.res-badge')?.textContent || '', number(index + 1));
      const summary = card.querySelector(':scope > p');
      if (summary) { const lead = clone(summary); lead.className = 'academic-lead'; section.append(lead); }
      const detail = clone(card.querySelector('.res-card-body'));
      if (detail.querySelectorAll('br').length > 3) section.classList.add('academic-resource-dense');
      detail.querySelectorAll('.exam-tip-box > span').forEach(node => node.remove());
      detail.querySelectorAll('.matrix-table').forEach(table => {
        table.dataset.columns = table.tHead.rows[0].cells.length;
        table.querySelectorAll('th').forEach(cell => cell.setAttribute('scope', 'col'));
      });
      for (const [selector, title] of [['.res-keypoints-list', 'أفكار أساسية'], ['.cheat-grid', 'بطاقات للمراجعة']]) {
        const block = detail.querySelector(selector);
        if (block) { const heading = document.createElement('h2'); heading.className = 'academic-section-label'; heading.textContent = title; block.before(heading); }
      }
      section.append(detail); body.append(section);
    });
    return { title: cards.length === 1 ? cards[0].querySelector('h3').textContent : 'ملف المراجع التربوية', content: body };
  }
  function mindmap() {
    const map = MINDMAPS_DATA.find(item => item.id === activeMapKey);
    if (!map) return null;
    const body = document.createElement('div');
    const overview = document.createElement('section'); overview.className = 'academic-map-overview academic-landscape';
    if (map.root.branches.length > 6) overview.classList.add('academic-map-dense');
    overview.innerHTML = header(map.root.name, 'خريطة ذهنية · نظرة تركيبية', map.title) +
      `<p class="academic-map-intro">${escape(map.description)}</p><div class="academic-map-guide"><span>${map.root.branches.length} فروع معرفية</span><span>الفكرة · المثال · التمييز · الاسترجاع</span></div><div class="academic-map-root"><strong>${escape(map.root.name)}</strong><span>${escape(map.root.prompt || '')}</span></div>` +
      '<div class="academic-map-grid">' + map.root.branches.map((branch, index) =>
        `<a class="academic-map-node" data-tone="${escape(branch.tone)}" href="#print-branch-${index + 1}"><span class="academic-map-node-meta"><b>${number(index + 1)}</b><span>${escape(branch.year || branch.keyword)}</span></span><h2>${escape(branch.title)}</h2><p>${escape(branch.tagline)}</p></a>`).join('') +
      `</div><p class="academic-map-memory"><strong>مفتاح التذكر:</strong> ${escape(map.memory)}</p>`;
    body.append(overview);
    map.root.branches.forEach((branch, index) => {
      const section = document.createElement('section'); section.className = 'academic-map-branch';
      section.id = `print-branch-${index + 1}`;
      section.dataset.tone = branch.tone;
      section.innerHTML = header(branch.title, `الفرع ${index + 1} من ${map.root.branches.length} · ${branch.keyword}`, map.root.name, number(index + 1));
      if (branch.term) {
        const term = document.createElement('p'); term.className = 'academic-branch-term'; term.dir = 'auto'; term.textContent = branch.term;
        section.querySelector('.academic-title-copy').append(term);
      }
      const template = document.createElement('template'); template.innerHTML = branchReadingHTML(map, branch);
      const reading = clone(template.content.firstElementChild);
      reading.querySelector('.map-branch-heading')?.remove();
      // Use the shorter example column for concept links; preserve room for recall below.
      const relations = reading.querySelector('.map-relations');
      if (relations) reading.querySelector('.map-example').append(relations);
      // Long additions use a single reading column so paragraphs paginate
      // naturally rather than fragmenting two parallel grid columns.
      if (reading.textContent.length > 2800) reading.classList.add('academic-map-long');
      section.append(reading); body.append(section);
    });
    const sources = document.createElement('section'); sources.className = 'academic-sources';
    sources.innerHTML = '<h2>المراجع ومسارات التوسع</h2><ol>' + map.sources.map(source =>
      `<li><a href="${escape(source.url)}">${escape(source.label)}</a></li>`).join('') +
      '</ol><p class="academic-note">الأمثلة ومفاتيح التذكر وأسئلة الاسترجاع أدوات للمراجعة، ويمكن الرجوع إلى المصادر للتوسع في المفاهيم.</p>';
    body.append(sources);
    return { title: 'خريطة ذهنية - ' + map.root.name, content: body };
  }
  function modules(id) {
    const items = [...document.querySelectorAll('.module-accordion')].filter(item => id === 'all' || (id ? item.id === id : !item.hidden));
    if (!items.length) throw new Error('اختر مجزوءة قبل إعداد ملف الطباعة.');
    const body = document.createElement('div');
    if (items.length > 1) {
      const selected = items.map(item => CURRICULUM_DATA.find(module => module.id === item.id));
      const cover = document.createElement('section'); cover.className = 'academic-module-cover';
      cover.innerHTML = `<div class="academic-cover-brand"><strong>تربيتي <bdi lang="en">Tarbiyati</bdi></strong><span>علوم التربية والديداكتيك</span></div>
        <div class="academic-cover-main"><span class="academic-cover-kicker">دليل الدراسة والمراجعة</span><h1>مجزوءات<br>علوم التربية</h1><p class="academic-cover-subtitle">من الأسس النظرية إلى الممارسة المهنية</p><p class="academic-cover-description">مرجع منظم يجمع الدروس والمحاور، لفهم المفاهيم التربوية وربطها بالممارسة الصفية.</p></div>
        <div class="academic-cover-stats"><div><strong>${number(items.length)}</strong><span>مجزوءات دراسية</span></div><div><strong>${selected.reduce((total, module) => total + module.sections.length, 0)}</strong><span>محاور للفهم والمراجعة</span></div></div>
        <div class="academic-cover-footer"><span>${id === 'all' ? 'المجموعة الكاملة' : 'مجزوءات مختارة'} · فهرس تفاعلي</span><time>${escape(date())}</time></div>`;
      body.append(cover);
      const contents = document.createElement('section'); contents.className = 'academic-contents academic-module-contents';
      contents.innerHTML = header('دليل المجزوءات', 'المحتويات', 'اختر عنوان مجزوءة للانتقال إليها داخل الملف.') +
        '<ol class="academic-contents-list">' + selected.map((module, index) =>
          `<li><a href="#print-${escape(module.id)}"><span>${escape(moduleTitles[CURRICULUM_DATA.indexOf(module)] || module.title)}</span><small>${module.sections.length} محاور · ${escape(module.badge)}</small></a></li>`).join('') +
        '</ol><p class="academic-note">يتضمن الملف النص الكامل لكل مجزوءة، بما في ذلك المحاور المطوية في الموقع.</p>';
      body.append(contents);
    }
    items.forEach(item => {
      const module = CURRICULUM_DATA.find(entry => entry.id === item.id);
      const section = document.createElement('section'); section.className = 'academic-module';
      section.id = 'print-' + module.id;
      section.innerHTML = header(module.title, 'مجزوءة دراسية', module.subtitle, number(CURRICULUM_DATA.indexOf(module) + 1));
      const lead = document.createElement('p'); lead.className = 'academic-lead'; lead.textContent = module.summary;
      const lessons = clone(item.querySelector('.module-body-text'));
      lessons.querySelectorAll('.lesson-section').forEach((lesson, index) => { lesson.id = 'print-' + module.sections[index].id; });
      const printedIds = new Set(items.flatMap(item => {
        const entry = CURRICULUM_DATA.find(module => module.id === item.id);
        return [entry.id, ...entry.sections.map(section => section.id)];
      }));
      lessons.querySelectorAll('a[href^="#mod-"]').forEach(link => {
        const original = link.getAttribute('href').slice(1);
        const target = CURRICULUM_ALIASES[original] || original;
        link.setAttribute('href', printedIds.has(target) ? '#print-' + target : new URL('modules.html#' + target, location.href).href);
      });
      section.append(lead, lessons); body.append(section);
    });
    return { title: items.length === 1 ? CURRICULUM_DATA.find(item => item.id === items[0].id).title : 'مجزوءات علوم التربية', content: body };
  }
  function infer() {
    const page = location.pathname.split('/').pop();
    return { 'fiche-generator.html': 'lesson', 'resources.html': 'resources', 'mindmaps.html': 'mindmap', 'modules.html': 'modules' }[page];
  }
  function prepare(kind = infer(), id) {
    const existing = document.getElementById('academicPrintDocument');
    if (existing) { fitFicheHeader(existing); return true; }
    const builders = { lesson, resources, mindmap, modules };
    if (!Object.hasOwn(builders, kind)) return false;
    const documentData = builders[kind](id);
    if (!documentData) return false;
    const root = document.createElement('article'); root.id = 'academicPrintDocument'; root.lang = documentData.language || 'ar'; root.dir = root.lang === 'fr' ? 'ltr' : 'rtl'; root.dataset.kind = kind;
    root.className = 'academic-document'; root.append(documentData.content);
    previousTitle = document.title;
    document.title = documentData.title + (documentData.branded === false ? '' : ' - تربيتي | Tarbiyati');
    document.body.append(root); document.body.classList.add('academic-printing');
    fitFicheHeader(root);
    return true;
  }
  function cleanup() {
    document.getElementById('academicPrintDocument')?.remove();
    document.body.classList.remove('academic-printing');
    if (previousTitle !== null) document.title = previousTitle;
    previousTitle = null; printing = false;
  }
  async function loadPrintFonts() {
    // A missing font must not prevent the browser's print dialog from opening.
    // The print styles provide Arabic-capable system serif fallbacks.
    await Promise.allSettled(['12pt Amiri', '700 12pt Amiri', '12pt "Noto Naskh Arabic"', '700 12pt "Noto Naskh Arabic"', '12pt "Noto Sans Arabic"', '600 12pt "Noto Sans Arabic"', '700 12pt "Noto Sans Arabic"'].map(font => document.fonts.load(font)));
  }
  async function print(kind, id) {
    if (printing) return;
    printing = true;
    try {
      await AccountManager.ready;
      if (!AccountManager.user?.emailVerified) { cleanup(); return; }
      await loadPrintFonts();
      if (!prepare(kind, id)) { cleanup(); return; }
      try {
        await Promise.all([...document.querySelectorAll('#academicPrintDocument img')].map(image => image.decode()));
      } catch {
        const french = document.getElementById('academicPrintDocument').lang === 'fr';
        throw new Error(french ? 'Impossible de charger les images pour l’impression. Rechargez la page et réessayez.' : 'تعذر تحميل الصور اللازمة للطباعة. أعد تحميل الصفحة ثم حاول مرة أخرى.');
      }
      // afterprint restores the title and removes the print copy, including on cancellation.
      window.print();
    } catch (error) { cleanup(); showToast(error.message || 'تعذر إعداد وثيقة الطباعة.'); }
  }
  window.addEventListener('beforeprint', () => { try { prepare(); } catch (error) { showToast(error.message); } });
  window.addEventListener('afterprint', cleanup);
  document.addEventListener('DOMContentLoaded', () => {
    // Local fonts also cover the browser's Ctrl+P flow when external font services are unavailable.
    loadPrintFonts();
  });
  return { prepare, cleanup, print };
})();

function printAcademicDocument() { return AcademicPrint.print(); }
