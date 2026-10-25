'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { gzipSync } = require('node:zlib');

const ROOT = path.join(__dirname, '..');
const BRAND = 'تربيتي | Tarbiyati';
const INDEXABLE = 'index, follow, max-image-preview:large';
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const moduleName = module => module.title.replace(/^المجزوءة\s+\d+:\s*/, '');
const lessonName = section => section.title.replace(/^\d+\.\s*/, '');
const modulePath = module => `/learn/${module.id}/`;
const mapPath = map => `/mindmaps/${map.id}/`;
const list = values => `<ul>${values.map(value => `<li>${escape(value)}</li>`).join('')}</ul>`;

function createPublicSite({ catalog, publicOrigin }) {
  // Never derive canonical URLs from an untrusted Host or forwarded-host header.
  const origin = publicOrigin || 'https://tarbiyati.com';
  const absolute = route => new URL(route, origin).href;
  const organization = { '@type': 'Organization', '@id': absolute('/#organization'), name: 'تربيتي', alternateName: 'Tarbiyati', url: absolute('/'),
    logo: { '@type': 'ImageObject', url: absolute('/assets/branding/logo.png'), width: 1024, height: 1024 } };
  const website = { '@type': 'WebSite', '@id': absolute('/#website'), name: 'تربيتي', alternateName: 'Tarbiyati', url: absolute('/'), inLanguage: 'ar', publisher: { '@id': organization['@id'] } };
  const pages = new Map();

  function metadata({ route, title, description, breadcrumbs, entity, type = 'WebPage' }) {
    const canonical = absolute(route);
    const webpage = { '@type': type, '@id': canonical + '#webpage', url: canonical, name: title, description, inLanguage: 'ar',
      isPartOf: { '@id': website['@id'] }, publisher: { '@id': organization['@id'] },
      ...(entity ? { mainEntity: { '@id': entity['@id'] } } : {}),
      ...(breadcrumbs ? { breadcrumb: { '@id': canonical + '#breadcrumb' } } : {}) };
    const graph = [organization, website, webpage, ...(entity ? [entity] : [])];
    if (breadcrumbs) graph.push({ '@type': 'BreadcrumbList', '@id': canonical + '#breadcrumb', itemListElement: breadcrumbs.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, item: absolute(item.route) })) });
    const schema = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
    return `<meta name="robots" content="${INDEXABLE}">
  <link rel="canonical" href="${escape(canonical)}">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="ar_MA">
  <meta property="og:site_name" content="تربيتي · Tarbiyati">
  <meta property="og:title" content="${escape(title)}">
  <meta property="og:description" content="${escape(description)}">
  <meta property="og:url" content="${escape(canonical)}">
  <meta property="og:image" content="${escape(absolute('/assets/branding/social-card.png'))}">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="تربيتي — علوم التربية والديداكتيك">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escape(title)}">
  <meta name="twitter:description" content="${escape(description)}">
  <meta name="twitter:image" content="${escape(absolute('/assets/branding/social-card.png'))}">
  <meta name="twitter:image:alt" content="تربيتي — علوم التربية والديداكتيك">
  <script type="application/ld+json">${schema}</script>`;
  }
  function breadcrumbsHTML(items) {
    return `<nav class="breadcrumbs" aria-label="مسار التصفح"><ol>${items.map((item, index) => `<li>${index === items.length - 1 ? `<span aria-current="page">${escape(item.name)}</span>` : `<a href="${escape(item.route)}">${escape(item.name)}</a>`}</li>`).join('')}</ol></nav>`;
  }
  function layout(data, content) {
    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escape(data.title)}</title>
  <meta name="description" content="${escape(data.description)}">
  <meta name="application-name" content="تربيتي · Tarbiyati">
  <meta name="theme-color" content="#203a32">
  ${metadata(data)}
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="preload" href="/assets/fonts/NotoSansArabic-Regular.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/styles/public.css">
  <script src="/scripts/theme.js"></script>
  <script src="/scripts/ui-actions.js" defer></script>
</head>
<body>
  <a class="skip-link" href="#main-content">انتقل إلى المحتوى</a>
  <header class="public-header"><div class="public-container public-nav">
    <a class="public-brand" href="/" aria-label="تربيتي، الصفحة الرئيسية"><img src="/assets/favicon.svg" width="42" height="42" alt="شعار تربيتي"><span>تربيتي <bdi lang="en">Tarbiyati</bdi></span></a>
    <nav aria-label="التنقل الرئيسي"><a href="/learn/">علوم التربية</a><a href="/mindmaps/">الخرائط الذهنية</a><a href="/pages/account.html?mode=register">مساحة التعلم</a></nav>
    <button id="themeToggleBtn" class="theme-button" type="button" data-click="toggleTheme" aria-label="تفعيل الوضع الليلي" aria-pressed="false">الوضع الليلي</button>
  </div></header>
  <main class="public-container" id="main-content" tabindex="-1">
    ${breadcrumbsHTML(data.breadcrumbs)}
    ${content}
  </main>
  <footer class="public-footer public-container"><p>تربيتي · علوم التربية والديداكتيك</p><nav aria-label="روابط التذييل"><a href="/learn/">دليل المجزوءات</a><a href="/mindmaps/">دليل الخرائط الذهنية</a><a href="/pages/account.html">تسجيل الدخول</a></nav><p>شروح وأمثلة تعليمية للمراجعة والتكوين، وليست موقعاً رسمياً للوزارة أو بديلاً عن الوثائق الأصلية.</p></footer>
</body>
</html>`;
  }
  function add(route, data, content) {
    const description = data.description;
    pages.set(route, { route, ...data, description, html: layout({ route, ...data, description }, content) });
  }
  const start = (route, label = 'ابدأ التعلم واحفظ تقدمك') => `<aside class="public-cta"><h2>واصل التعلم في مساحتك الشخصية</h2><p>هذا دليل عام للتعرف على المفاهيم وتنظيم المراجعة. الشروح المفصلة والتطبيقات وتتبع التقدم متاحة بعد تسجيل الدخول.</p><a class="public-button" href="/pages/account.html?mode=register&amp;next=${encodeURIComponent(route)}">${escape(label)}</a></aside>`;
  function sourceLinks(sources) {
    const unique = [...new Map(sources.map(source => [source.url, source])).values()].slice(0, 6);
    return `<section class="public-sources"><h2>مراجع للتوسع والتحقق</h2><p>أرقام صفحات PDF تشمل الغلاف. الأمثلة وأسئلة المراجعة أدوات تعليمية من إعداد تربيتي.</p><ul>${unique.map(source => `<li><a href="${escape(source.url)}">${escape(source.title || source.label)}</a>${source.locator ? ` <span>· ${escape(source.locator)}</span>` : ''}</li>`).join('')}</ul></section>`;
  }
  const collection = (route, entries) => ({ '@type': 'ItemList', '@id': absolute(route) + '#list', itemListElement: entries.map((entry, index) => ({ '@type': 'ListItem', position: index + 1, name: entry.name, url: absolute(entry.route) })) });
  const homeTitle = 'تربيتي | علوم التربية والديداكتيك وإعداد المدرسين';
  const homeDescription = 'تعلم علوم التربية والديداكتيك مع تربيتي: دليل ثماني مجزوءات، خرائط ذهنية، أسئلة تدريبية وجذاذات. استكشف الأدلة العامة وأنشئ حساباً لحفظ تقدمك.';
  const home = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
    .replace(/<title>[^<]*<\/title>/, `<title>${escape(homeTitle)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${escape(homeDescription)}">`)
    .replace('<!-- SEO_METADATA -->', metadata({ route: '/', title: homeTitle, description: homeDescription }));
  pages.set('/', { route: '/', title: homeTitle, description: homeDescription, html: home });

  add('/learn/', { title: `دليل مجزوءات علوم التربية والديداكتيك | ${BRAND}`, description: 'استكشف ثماني مجزوءات في علوم التربية: النظام التربوي، علم النفس، نظريات التعلم، البيداغوجيا، الديداكتيك، التدبير الصفي، التقويم والحياة المدرسية.', type: 'CollectionPage',
    breadcrumbs: [{ name: 'الرئيسية', route: '/' }, { name: 'دليل علوم التربية', route: '/learn/' }],
    entity: collection('/learn/', catalog.modules.map(module => ({ name: moduleName(module), route: modulePath(module) }))) },
  `<header class="public-intro"><span class="public-eyebrow">مسار التكوين والمراجعة</span><h1>دليل علوم التربية والديداكتيك</h1><p>ابدأ بالسؤال الذي تريد فهمه، ثم اربط النظرية بموقف صفي. تضم المنصة ${catalog.modules.length} مجزوءات و${catalog.modules.reduce((total, module) => total + module.sections.length, 0)} محوراً، مع أهداف تعلم وتطبيقات ومراجع.</p></header>
   <div class="public-grid">${catalog.modules.map(module => `<article class="public-card"><span class="public-eyebrow">${module.sections.length} محاور</span><h2><a href="${modulePath(module)}">${escape(moduleName(module))}</a></h2><p>${escape(module.scope)}</p><a class="public-link" href="${modulePath(module)}">استكشف أهداف ومحاور ${escape(moduleName(module))} ←</a></article>`).join('')}</div>
   <section class="public-section"><h2>كيف تنظم مراجعتك؟</h2><ol><li>حدد المفهوم والسؤال الذي يفسره قبل حفظ اسم النظرية.</li><li>قارن بين مفهومين متقاربين، وابحث عن دليل من وضعية فعلية.</li><li>راجع العلاقات في <a href="/mindmaps/">الخرائط الذهنية لعلوم التربية</a>، ثم جرب تطبيقاً جديداً.</li><li>ارجع إلى المرجع الأصلي عند التحقق من نسبة قول أو من وثيقة إصلاح.</li></ol></section>`);

  for (const module of catalog.modules) {
    const name = moduleName(module), route = modulePath(module);
    const related = catalog.mindmaps.filter(map => map.root.branches.some(branch => branch.moduleId === module.id));
    add(route, { title: `${name} — الأهداف والمفاهيم | تربيتي`, description: `دليل ${name}: تعرف على ${module.sections.length} محاور، أهداف التعلم، مفاهيم يكثر الخلط بينها، تطبيق صفي ومراجع تساعدك على تنظيم مراجعتك.`,
      breadcrumbs: [{ name: 'الرئيسية', route: '/' }, { name: 'دليل علوم التربية', route: '/learn/' }, { name, route }],
      entity: { '@type': 'Course', '@id': absolute(route) + '#course', name, description: module.scope, inLanguage: 'ar', url: absolute(route), provider: { '@id': organization['@id'] }, teaches: module.studyGoals } },
    `<header class="public-intro"><span class="public-eyebrow">دليل المجزوءة · ${module.sections.length} محاور</span><h1>${escape(name)}</h1><p>${escape(module.scope)}</p></header>
     <section class="public-section"><h2>ما الذي ستتعلمه؟</h2>${list(module.studyGoals)}</section>
     <section class="public-section"><h2>محاور المجزوءة ومقاصدها</h2><div class="public-lessons">${module.sections.map(section => `<article id="${section.id}"><h3>${escape(lessonName(section))}</h3>${list(section.objectives)}<a href="/pages/modules.html#${section.id}">اقرأ شرح ${escape(lessonName(section))} في مساحة التعلم ←</a></article>`).join('')}</div></section>
     <section class="public-section"><h2>مفاهيم يكثر الخلط بينها</h2><dl class="public-distinctions">${module.workshop.pitfalls.map(item => `<div><dt>${escape(item.claim)}</dt><dd>${escape(item.correction)}</dd></div>`).join('')}</dl></section>
     <section class="public-section"><h2>تطبيق للمراجعة: ${escape(module.workshop.title)}</h2><p>${escape(module.workshop.situation)}</p><h3>أسئلة تساعدك على التحليل</h3>${list(module.workshop.tasks)}<p>ابدأ بوصف المعطيات، ثم اقترح تفسيراً وتدخلاً ودليلاً للتحقق. التحليل المقترح ومعايير المراجعة متاحان داخل المجزوءة.</p></section>
     ${related.length ? `<section class="public-section"><h2>خرائط ذهنية مرتبطة بهذه المجزوءة</h2><ul>${related.map(map => `<li><a href="${mapPath(map)}">${escape(map.shortTitle)}</a> · ${escape(map.description)}</li>`).join('')}</ul></section>` : ''}
     ${sourceLinks(module.sections.flatMap(section => section.sources))}
     ${start('/pages/modules.html#' + module.id)}
     <nav class="public-related" aria-label="مجزوءات أخرى"><h2>واصل استكشاف علوم التربية</h2><ul>${catalog.modules.filter(item => item.id !== module.id).map(item => `<li><a href="${modulePath(item)}">${escape(moduleName(item))}</a></li>`).join('')}</ul></nav>`);
  }
  add('/mindmaps/', { title: `خرائط ذهنية لعلوم التربية والديداكتيك | ${BRAND}`, description: 'راجع علوم التربية بخمس خرائط ذهنية و40 فرعاً: نظريات التعلم، الآثار الديداكتيكية، الإصلاحات، التقويم والتواصل، والربط بين المفاهيم والممارسة.', type: 'CollectionPage',
    breadcrumbs: [{ name: 'الرئيسية', route: '/' }, { name: 'الخرائط الذهنية', route: '/mindmaps/' }],
    entity: collection('/mindmaps/', catalog.mindmaps.map(map => ({ name: map.shortTitle, route: mapPath(map) }))) },
  `<header class="public-intro"><span class="public-eyebrow">اربط المفاهيم قبل حفظها</span><h1>خرائط ذهنية لعلوم التربية والديداكتيك</h1><p>خمسة أدلة تضم 40 فرعاً معرفياً. اقرأ ملخص الفكرة والتمييز بينها وبين المفاهيم المجاورة، ثم راجع الخريطة التفاعلية في حسابك.</p></header>
   <div class="public-grid">${catalog.mindmaps.map(map => `<article class="public-card"><span class="public-eyebrow">${map.root.branches.length} فروع</span><h2><a href="${mapPath(map)}">${escape(map.shortTitle)}</a></h2><p>${escape(map.description)}</p><a class="public-link" href="${mapPath(map)}">استكشف مفاهيم ${escape(map.shortTitle)} ←</a></article>`).join('')}</div>
   <section class="public-section"><h2>استعمل الخريطة للاسترجاع والفهم</h2><p>غط الشرح وحاول تفسير العلاقة بين فرعين بكلماتك، ثم اختبر تفسيرك بمثال جديد. مفاتيح التذكر وسائل مقترحة للمراجعة؛ لا تغني عن فهم المفهوم والتحقق من المرجع.</p><p>تجد الشروح المنظمة في <a href="/learn/">دليل مجزوءات علوم التربية</a>.</p></section>`);
  const branches = new Map(catalog.mindmaps.flatMap(map => map.root.branches.map(branch => [branch.id, { branch, map }])));
  for (const map of catalog.mindmaps) {
    const route = mapPath(map);
    add(route, { title: `خريطة ${map.shortTitle} — علوم التربية | تربيتي`, description: `خريطة ${map.shortTitle} في ${map.root.branches.length} فروع: ملخصات المفاهيم والفروق بينها، علاقات معرفية ومراجع للمراجعة في علوم التربية والديداكتيك.`,
      breadcrumbs: [{ name: 'الرئيسية', route: '/' }, { name: 'الخرائط الذهنية', route: '/mindmaps/' }, { name: map.shortTitle, route }],
      entity: { '@type': 'LearningResource', '@id': absolute(route) + '#resource', name: map.shortTitle, description: map.description, inLanguage: 'ar', learningResourceType: 'خريطة ذهنية', url: absolute(route), publisher: { '@id': organization['@id'] } } },
    `<header class="public-intro"><span class="public-eyebrow">${map.root.branches.length} فروع معرفية</span><h1>خريطة ${escape(map.shortTitle)}</h1><p>${escape(map.description)}</p></header>
     <nav class="public-contents" aria-label="فروع الخريطة"><h2>مفاهيم هذه الخريطة</h2><ul>${map.root.branches.map(branch => `<li><a href="#${branch.id}">${escape(branch.title)}</a></li>`).join('')}</ul></nav>
     ${map.root.branches.map(branch => `<section class="public-section" id="${branch.id}"><h2>${escape(branch.title)}</h2><p>${escape(branch.summary)}</p><h3>ميز بين المفاهيم</h3><p>${escape(branch.confusion)}</p><h3>علاقة تساعد على الفهم</h3><ul>${branch.related.map(link => { const target = branches.get(link.branchId); return `<li><a href="${mapPath(target.map)}#${target.branch.id}">${escape(target.branch.title)}</a>: ${escape(link.relation)}</li>`; }).join('')}</ul><p><a href="/learn/${branch.moduleId}/#${branch.sectionId}">راجع أهداف المحور المرتبط بمفهوم ${escape(branch.title)} ←</a></p></section>`).join('')}
     ${sourceLinks(map.sources)}
     ${start('/pages/mindmaps.html#' + map.id, 'افتح الخريطة التفاعلية في حسابك')}
     <nav class="public-related" aria-label="خرائط أخرى"><h2>خرائط أخرى للمراجعة</h2><ul>${catalog.mindmaps.filter(item => item.id !== map.id).map(item => `<li><a href="${mapPath(item)}">${escape(item.shortTitle)}</a></li>`).join('')}</ul></nav>`);
  }

  // Pre-render and compress public documents once. No sessions or learner data enter this cache.
  const responses = new Map();
  function cache(route, body, type, indexable = false) {
    const raw = Buffer.from(body);
    const gzip = gzipSync(raw);
    const etag = bytes => '"' + crypto.createHash('sha256').update(bytes).digest('hex') + '"';
    responses.set(route, { raw, gzip, type, indexable, rawETag: etag(raw), gzipETag: etag(gzip) });
  }
  for (const page of pages.values()) cache(page.route, page.html, 'text/html; charset=utf-8', true);
  cache('/robots.txt', `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /.data/\nDisallow: /backend/\nDisallow: /content/\nDisallow: /tools/\nDisallow: /tests/\nDisallow: /scratch/\nDisallow: /output/\nDisallow: /.env\n\nSitemap: ${absolute('/sitemap.xml')}\n`, 'text/plain; charset=utf-8');
  cache('/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...pages.keys()].map(route => `  <url><loc>${escape(absolute(route))}</loc></url>`).join('\n')}\n</urlset>\n`, 'application/xml; charset=utf-8');
  function redirect(req, res, target) {
    res.writeHead(301, { Location: target, 'Content-Length': 0 }); res.end(); return true;
  }
  function handle(req, res, url) {
    const pathname = url.pathname === '/index.html' ? '/' : url.pathname;
    if (!pathname.endsWith('/') && pages.has(pathname + '/')) return redirect(req, res, pathname + '/' + url.search);
    const response = responses.get(pathname);
    if (!response) return false;
    const acceptsGzip = (req.headers['accept-encoding'] || '').split(',').some(value => /^gzip(?:\s*;|\s*$)/i.test(value.trim()) && !/;\s*q=0(?:\.0*)?\s*$/i.test(value));
    const bytes = acceptsGzip ? response.gzip : response.raw;
    const etag = acceptsGzip ? response.gzipETag : response.rawETag;
    res.setHeader('Content-Type', response.type);
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    res.setHeader('Vary', 'Accept-Encoding');
    res.setHeader('ETag', etag);
    res.setHeader('X-Robots-Tag', response.indexable ? INDEXABLE : 'noindex');
    if (acceptsGzip) res.setHeader('Content-Encoding', 'gzip');
    if ((req.headers['if-none-match'] || '').split(',').some(value => value.trim() === '*' || value.trim().replace(/^W\//, '') === etag)) {
      res.writeHead(304); res.end(); return true;
    }
    res.setHeader('Content-Length', bytes.length);
    res.writeHead(200); res.end(req.method === 'HEAD' ? undefined : bytes); return true;
  }
  return { handle, publicPaths: [...pages.keys()] };
}

module.exports = { createPublicSite };
