/**
 * التطبيق التفاعلي الرئيسي لمنصة علوم التربية
 * يدير الثيم، التقدم الدراسي، الإشعارات، والتنقل
 */

// Theme controls are shared with the public pages through theme.js.

// 2. Mobile Menu Toggle
function toggleMobileMenu() {
  const sidebar = document.getElementById('siteSidebar');
  if (!sidebar) return;
  if (sidebar.classList.contains('mobile-open')) return closeMobileMenu();
  sidebar.inert = false;
  sidebar.classList.add('mobile-open');
  sidebar.setAttribute('role', 'dialog');
  sidebar.setAttribute('aria-modal', 'true');
  document.querySelector('.sidebar-overlay')?.classList.add('open');
  document.querySelector('.menu-trigger')?.setAttribute('aria-expanded', 'true');
  document.body.classList.add('menu-open');
  sidebar.querySelector('.sidebar-close')?.focus();
}

function closeMobileMenu(restoreFocus = true) {
  const sidebar = document.getElementById('siteSidebar');
  if (!sidebar) return;
  sidebar.classList.remove('mobile-open');
  sidebar.removeAttribute('role');
  sidebar.removeAttribute('aria-modal');
  sidebar.inert = window.matchMedia('(max-width: 800px)').matches;
  document.querySelector('.sidebar-overlay')?.classList.remove('open');
  const trigger = document.querySelector('.menu-trigger');
  trigger?.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('menu-open');
  if (restoreFocus) trigger?.focus();
}

document.addEventListener('click', event => {
  if (event.target.closest('.site-sidebar a') && document.body.classList.contains('menu-open')) closeMobileMenu(false);
});

// 4. Progress is loaded from the authenticated account in accounts.js.
function updateProgressUI() {
  const data = ProgressManager.getData();
  const modCounter = document.getElementById('userModulesCount');
  const quizCounter = document.getElementById('userQuizScore');
  const simCounter = document.getElementById('userSimCount');
  
  if (modCounter) modCounter.textContent = `${data.completedModules.length} / 8`;
  if (quizCounter) quizCounter.textContent = `${data.quizScore}%`;
  if (simCounter) simCounter.textContent = `${data.simulatorCompleted.length} / ${AccountManager.totals.simulator || 0}`;
}

// 5. Toast System
function showToast(message) {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    container.setAttribute('role', 'status');
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// 6. Web Audio API Synth Feedback (Zero external audio files)
function playAudioFeedback(type = 'success') {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      // Pleasant rising major third chime
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.exponentialRampToValueAtTime(659.25, ctx.currentTime + 0.15); // E5
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } else {
      // Gentle low double click
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(260, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    }
  } catch (e) {
    // Ignore audio context autoplay constraints
  }
}

// 7. Global Quick Search Modal (Ctrl + K)
let quickSearchReturnFocus = null;
function openQuickSearch() {
  if (document.body.classList.contains('menu-open')) closeMobileMenu(false);
  let backdrop = document.getElementById('searchModalBackdrop');
  if (!backdrop) {
    createQuickSearchModal();
    backdrop = document.getElementById('searchModalBackdrop');
  }
  if (!backdrop.classList.contains('open')) quickSearchReturnFocus = document.activeElement;
  backdrop.classList.add('open');
  document.body.classList.add('search-open');
  const input = document.getElementById('globalQuickSearchInput');
  if (input) {
    input.value = '';
    input.focus();
    performGlobalSearch('');
  }
}

function closeQuickSearch() {
  const backdrop = document.getElementById('searchModalBackdrop');
  if (!backdrop?.classList.contains('open')) return;
  backdrop.classList.remove('open');
  document.body.classList.remove('search-open');
  quickSearchReturnFocus?.focus();
}

function createQuickSearchModal() {
  const backdrop = document.createElement('div');
  backdrop.className = 'search-modal-backdrop';
  backdrop.id = 'searchModalBackdrop';
  backdrop.onclick = (e) => {
    if (e.target === backdrop) closeQuickSearch();
  };

  const isInPagesDir = window.location.pathname.includes('/pages/');
  const rootPrefix = isInPagesDir ? '../' : '';

  backdrop.innerHTML = `
    <div class="search-modal-window" role="dialog" aria-modal="true" aria-label="البحث في المنصة">
      <div class="search-modal-header">
        <span style="font-size: 1.2rem;">🔍</span>
        <input type="search" id="globalQuickSearchInput" aria-label="ابحث في الدروس والمفاهيم" placeholder="ابحث في الدروس والمفاهيم..." data-input="performGlobalSearch" data-args="[&quot;$value&quot;]">
        <button class="search-modal-close-btn" aria-label="إغلاق البحث" data-click="closeQuickSearch">✕</button>
      </div>
      <div class="search-modal-results" id="globalSearchResults">
        <!-- Results injected here -->
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
}

function performGlobalSearch(query) {
  const container = document.getElementById('globalSearchResults');
  if (!container) return;
  container.innerHTML = '';

  const q = (query || '').toLowerCase().trim();
  const isInPagesDir = window.location.pathname.includes('/pages/');
  const pPrefix = isInPagesDir ? '' : 'pages/';

  const quickLinks = [
    { title: 'المجزوءة 1: النظام التربوي والميثاق وخارطة الطريق', cat: 'الموسوعة', desc: 'كرونولوجيا الإصلاحات والقانون الإطار 51.17', link: `${pPrefix}modules.html#mod-1` },
    { title: 'المجزوءة 2: سيكولوجية التربية ونظريات النمو والشخصية', cat: 'الموسوعة', desc: 'بياجيه، فرويد، إريكسون، كولبرج، وبولبي', link: `${pPrefix}modules.html#mod-2` },
    { title: 'المجزوءة 3: نظريات التعلم الكبرى (السلوكية، الجشطلت، البنائية)', cat: 'الموسوعة', desc: 'الرواد، الاستبصار، الصراع المعرفي، و ZPD', link: `${pPrefix}modules.html#mod-3` },
    { title: 'المجزوءة 4: البيداغوجيات الوظيفية وصنافات الأهداف', cat: 'الموسوعة', desc: 'الفارقية، الخطأ، حل المشكلات، وصنافة بلوم', link: `${pPrefix}modules.html#mod-4` },
    { title: 'المجزوءة 5: الديداكتيك العام والآثار الديداكتيكية الـ 12', cat: 'الموسوعة', desc: 'أثر طوباز، جوردان، متى، والانزلاق الميتامعرفي', link: `${pPrefix}modules.html#mod-5` },
    { title: 'المجزوءة 6: تخطيط وتدبير التعلمات والتواصل الصفي', cat: 'الموسوعة', desc: 'الجذاذة، شبكات التواصل، وفيليبس 6×6', link: `${pPrefix}modules.html#mod-6` },
    { title: 'المجزوءة 7: التقويم والدعم والمعالجة البيداغوجية', cat: 'الموسوعة', desc: 'أنواع التقويم، المعايير والمؤشرات، والدعم المندمج', link: `${pPrefix}modules.html#mod-7` },
    { title: 'المجزوءة 8: الحياة المدرسية ومجالس المؤسسة الأربعة', cat: 'الموسوعة', desc: 'مشروع المؤسسة PEI ومرسوم 2.02.376', link: `${pPrefix}modules.html#mod-8` },
    { title: 'المحاكي المهني ومختبر الوضعيات الصفية', cat: 'محاكاة', desc: 'كشف ومعالجة عوائق القسم والآثار الديداكتيكية', link: `${pPrefix}simulator.html` },
    { title: 'بنك الـ QCM ومحاكي مباريات التعليم', cat: 'اختبارات', desc: 'أسئلة مفاهيمية ووضعيات تطبيقية مع شرح للإجابات', link: `${pPrefix}quiz.html` },
    { title: 'امتحانات علوم التربية 2023 و2024 و2025', cat: 'امتحانات', desc: 'الأوراق الأصلية وتصحيح في النهاية وتعليلات مرتبطة بالمجزوءات', link: `${pPrefix}exams.html` },
    { title: 'الخرائط الذهنية الأفقية التفاعلية', cat: 'خرائط', desc: 'تصفح شجري أفقي مع خاصية النقر لإظهار التفاصيل', link: `${pPrefix}mindmaps.html` },
    { title: 'المعجم التربوي (عربي - فرنسي)', cat: 'معجم', desc: 'مصطلحات علوم التربية مع تعريفات وأمثلة وروابط للمجزوءات', link: `${pPrefix}glossary.html` },
    { title: 'بطاقات الاستذكار السريع Flashcards', cat: 'حفظ', desc: 'تكرار متباعد لحفظ الرواد والتواريخ والمفاهيم', link: `${pPrefix}flashcards.html` },
    { title: 'مولد الجذاذات وبطاقات الدعم المدرسية', cat: 'أداة', desc: 'توليد وطباعة جذاذة بيداغوجية وبطاقة معالجة', link: `${pPrefix}fiche-generator.html` },
    { title: 'الخزانة التربوية والمراجع الرسمية الشاملة', cat: 'مراجع', desc: 'الميثاق، الكتاب الأبيض، الرؤية الاستراتيجية، والقانون الإطار 51.17', link: `${pPrefix}resources.html` },
    { title: 'مصفوفة المقارنة الكبرى بين نظريات التعلم الخمس', cat: 'مقارنات', desc: 'جدول مقارن شامل: السلوكية، الجشطلتية، البنائية، السوسيوبنائية، والمعرفية', link: `${pPrefix}resources.html` },
    { title: 'حقيبة الأستاذ المهنية (دفتر النصوص ووثائق القسم)', cat: 'وثائق', desc: 'الضوابط القانونية لدفتر النصوص ووثائق التدبير الصفي و PEI', link: `${pPrefix}resources.html` }
  ];

  const matched = quickLinks.filter(item => {
    return !q || item.title.toLowerCase().includes(q) || item.desc.toLowerCase().includes(q) || item.cat.toLowerCase().includes(q);
  });

  if (matched.length === 0) {
    container.innerHTML = '<div style="text-align: center; padding: 25px; color: var(--text-muted);">لم يتم العثور على نتائج مطابقة لبحثك.</div>';
    return;
  }

  matched.forEach(item => {
    const a = document.createElement('a');
    a.className = 'search-result-item';
    a.href = item.link;
    a.onclick = () => closeQuickSearch();
    a.innerHTML = `
      <div class="search-result-info">
        <h5>${item.title}</h5>
        <p>${item.desc}</p>
      </div>
      <span class="card-badge" style="font-size: 0.75rem;">${item.cat}</span>
    `;
    container.appendChild(a);
  });
}

window.addEventListener('learning-progress', updateProgressUI);

// Global Keyboard Shortcuts (Ctrl+K to open search, Escape to close)
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    openQuickSearch();
  } else if (e.key === 'Escape') {
    closeQuickSearch();
    if (document.body.classList.contains('menu-open')) closeMobileMenu();
  } else if (e.key === 'Tab') {
    const panel = document.querySelector('.search-modal-backdrop.open .search-modal-window') || document.querySelector('.site-sidebar.mobile-open');
    if (!panel) return;
    const controls = [...panel.querySelectorAll('a[href], button, input, select, [tabindex="0"]')].filter(element => !element.disabled && element.getClientRects().length);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  }
});

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  updateProgressUI();
  const mobileViewport = window.matchMedia('(max-width: 800px)');
  const syncSidebar = () => closeMobileMenu(false);
  syncSidebar();
  mobileViewport.addEventListener('change', syncSidebar);
});
