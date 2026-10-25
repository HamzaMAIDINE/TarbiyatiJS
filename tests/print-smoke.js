'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { fixture, verificationCode } = require('./helpers');
const delay = ms => new Promise(resolve => setTimeout(resolve,ms));

async function printSmoke() {
  const executable = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/google-chrome','/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(filename=>fs.existsSync(filename));
  if (!executable) throw new Error('Set CHROME_PATH to a Chrome/Chromium/Edge executable for browser tests.');
  const cleanups = []; let clockOffset = 0;
  const f = await fixture({after:fn=>cleanups.push(fn)},{now:()=>Date.now()+clockOffset, adminEmails:['browser-admin@example.test']});
  const artifacts = fs.mkdtempSync(path.join(os.tmpdir(),'tarbiyati-print-artifacts-'));
  let chrome, socket; let step = 'startup'; const errors = [], violations = [];
  try {
    const profile = path.join(f.directory,'chrome');
    chrome = spawn(executable,['--headless=new','--remote-debugging-port=0','--user-data-dir='+profile,
      '--disable-background-networking','--disable-component-update','--no-first-run','--no-default-browser-check','about:blank'],{windowsHide:true,stdio:'ignore'});
    const portFile = path.join(profile,'DevToolsActivePort');
    for(let i=0;i<150&&!fs.existsSync(portFile);i++)await delay(100);
    if (!fs.existsSync(portFile)) throw new Error('Browser failed to start.');
    const port = fs.readFileSync(portFile,'utf8').split('\n')[0];
    const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    socket = new WebSocket(targets.find(target=>target.type==='page').webSocketDebuggerUrl); await once(socket,'open');
    let sequence=0; const pending=new Map();
    socket.addEventListener('message',event=>{
      const message=JSON.parse(event.data);
      if(message.id) { const entry=pending.get(message.id); if(!entry)return; pending.delete(message.id);clearTimeout(entry.timer);message.error?entry.reject(new Error(JSON.stringify(message.error))):entry.resolve(message.result); }
      else if(message.method==='Runtime.exceptionThrown') errors.push({step,message:message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text});
      else if(message.method==='Log.entryAdded'&&message.params.entry.source==='security'&&message.params.entry.text.includes('Content Security Policy')) violations.push({step,message:message.params.entry.text});
    });
    const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Timed out: '+method));},20000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
    const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;};
    const waitFor=async(expression,label=expression)=>{for(let i=0;i<180;i++){await delay(100);try{if(await evaluate(expression))return;}catch{}}throw new Error('Waiting for '+label+' during '+step);};
    const navigate=async(route,ready)=>{await send('Page.navigate',{url:f.origin+route});await waitFor(`location.pathname===${JSON.stringify(route.split('?')[0].split('#')[0]||'/')}&&document.readyState==='complete'&&document.documentElement.dataset.auth!=='loading'`,'page readiness');if(ready)await waitFor(ready);};
    const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    const fill=(id,value)=>evaluate(`(()=>{const input=document.getElementById(${JSON.stringify(id)});input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    const screenshot=async name=>{await delay(300);const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(shot.data,'base64'));};
    await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Log.enable');
    await send('Network.setBlockedURLs',{urls:['*fonts.googleapis.com*','*fonts.gstatic.com*']});
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});

    step='print font delivery';
    const ministryLogo=await f.request('/assets/branding/education-ministry-ar-amazigh.svg');
    assert.equal(ministryLogo.status,200);assert.equal(ministryLogo.headers.get('content-type'),'image/svg+xml');
    for(const filename of ['Amiri-Regular.ttf','Amiri-Bold.ttf','NotoNaskhArabic-Regular.ttf','NotoNaskhArabic-Bold.ttf','NotoSansArabic-Regular.ttf','NotoSansArabic-Bold.ttf']) {
      const font=await f.request('/assets/fonts/'+filename);
      assert.equal(font.status,200);assert.equal(font.headers.get('content-type'),'font/ttf');
    }
    const reader=await f.register('print-reader@example.test');
    await send('Network.setCookie',{name:'edu_session',value:reader.cookie.slice(12),url:f.origin,httpOnly:true,sameSite:'Lax'});
    // Run before the normal cases warm Chrome's in-memory font cache.
    step='PDF button with unavailable local fonts';
    await send('Network.setBlockedURLs',{urls:['*fonts.googleapis.com*','*fonts.gstatic.com*','*assets/fonts/*']});
    await navigate('/pages/fiche-generator.html','sheetReady');
    await evaluate('document.fonts.ready');
    assert.equal(await evaluate("document.fonts.check('12pt Amiri')"),false,'print font is unavailable');
    const fallbackState=await evaluate('JSON.stringify(sheetFields())');
    const fallbackTitle=await evaluate('document.title');
    await evaluate("window.print=()=>{window.printCalls=(window.printCalls||0)+1;window.dispatchEvent(new Event('beforeprint'));window.printedFicheText=document.getElementById('academicPrintDocument').textContent;window.dispatchEvent(new Event('afterprint'))};printAcademicDocument()");
    assert.equal(await evaluate('window.printCalls'),1,'PDF dialog opens despite failed font requests');
    assert.equal(await evaluate("window.printedFicheText.includes(sheetFields().title)"),true,'lesson content is preserved');
    assert.equal(await evaluate('JSON.stringify(sheetFields())'),fallbackState);
    assert.equal(await evaluate('document.title'),fallbackTitle);
    assert.equal(await evaluate("document.getElementById('academicPrintDocument')===null&&!document.body.classList.contains('academic-printing')"),true,'fallback restores page state');
    assert.equal(await evaluate("[...document.querySelectorAll('.toast')].some(el=>el.textContent.includes('network error'))"),false);
    console.log('PASS PDF button opens with unavailable local fonts and preserves the fiche');
    step='PDF input injection';
    await evaluate(`window.securityFicheSnapshot=sheetFields();document.getElementById('inTitle').value='<svg onload="window.pdfInjected=true"></svg>';renderSheet()`);
    assert.equal(await evaluate('AcademicPrint.prepare("lesson")'),true);
    assert.equal(await evaluate("document.getElementById('academicPrintDocument').textContent.includes('<svg onload=')"),true,'PDF preserves markup as literal text');
    assert.equal(await evaluate("document.querySelector('#academicPrintDocument svg[onload]')===null&&!window.pdfInjected"),true,'PDF input cannot create active SVG');
    await evaluate('AcademicPrint.cleanup();fillSheet(window.securityFicheSnapshot)');
    console.log('PASS PDF markup input remains literal text');
    await navigate('/pages/resources.html');
    await evaluate('document.fonts.ready');
    assert.equal(await evaluate("document.fonts.check('12pt \"Noto Naskh Arabic\"')"),false,'new body font is unavailable');
    await evaluate("window.print=()=>{window.printCalls=(window.printCalls||0)+1;window.dispatchEvent(new Event('beforeprint'));window.printedResourceText=document.getElementById('academicPrintDocument').textContent;window.dispatchEvent(new Event('afterprint'))};printAcademicDocument()");
    assert.equal(await evaluate('window.printCalls'),1,'resource PDF still opens when local fonts fail');
    assert.equal(await evaluate('RESOURCES_DATA.items.every(item=>window.printedResourceText.includes(item.title))'),true,'font fallback preserves every resource');
    assert.equal(await evaluate("document.getElementById('academicPrintDocument')===null&&!document.body.classList.contains('academic-printing')"),true);
    console.log('PASS resources print with unavailable local fonts');
    await send('Network.setBlockedURLs',{urls:['*fonts.googleapis.com*','*fonts.gstatic.com*']});
    const manifest=[];
    const load=async(route,ready)=>{
      await navigate(route,ready);
      await evaluate("Promise.all(['12pt Amiri','700 12pt Amiri','12pt \"Noto Naskh Arabic\"','700 12pt \"Noto Naskh Arabic\"','12pt \"Noto Sans Arabic\"','600 12pt \"Noto Sans Arabic\"','700 12pt \"Noto Sans Arabic\"'].map(font=>document.fonts.load(font)))");
      assert.equal(await evaluate("['12pt Amiri','700 12pt Amiri','12pt \"Noto Naskh Arabic\"','700 12pt \"Noto Sans Arabic\"'].every(font=>document.fonts.check(font))"),true,'local print fonts work with external font services blocked');
    };
    const pdf=async(name,kind,id,originalTitle)=>{
      step=name;
      const title=originalTitle??await evaluate('document.title');
      assert.equal(await evaluate(`AcademicPrint.prepare(${JSON.stringify(kind)},${JSON.stringify(id)})`),true);
      const content=await evaluate("document.getElementById('academicPrintDocument').textContent");
      const repeatedHeader=kind==='lesson'?await evaluate("document.querySelector('#academicPrintDocument .fiche-page-header').textContent"):null;
      if(kind==='lesson') {
        assert.equal(content.includes('تربيتي'),false,'fiche branding replaced');
        assert.equal(await evaluate("document.getElementById('ficheMinistryLogo').getAttribute('src')"),'../assets/branding/education-ministry-ar-amazigh.svg','Arabic and French fiches retain the Arabic–Amazigh ministry logo');
        assert.equal(await evaluate("document.querySelector('#academicPrintDocument .sheet-ministry-logo').getAttribute('src')===document.getElementById('ficheMinistryLogo').getAttribute('src')"),true,'full original preview logo is used');
        assert.equal(await evaluate("document.querySelector('#academicPrintDocument .sheet-document-header').textContent===document.querySelector('#sheetPreview .sheet-document-header').textContent&&document.querySelector('#academicPrintDocument .sheet-context-grid').textContent===document.querySelector('#sheetPreview .sheet-context-grid').textContent"),true,'heading and classroom details match the preview');
        assert.equal(await evaluate("document.querySelector('#academicPrintDocument .sheet-lesson-title').textContent===sheetFields().title"),true,'lesson name appears under the document heading in the PDF');
        assert.equal(await evaluate("JSON.stringify([...document.querySelectorAll('#academicPrintDocument .sheet-header-table tr,#academicPrintDocument .sheet-steps-table tr')].map(row=>[...row.cells].map(cell=>cell.textContent)))===JSON.stringify([...document.querySelectorAll('#sheetPreview .sheet-header-table tr,#sheetPreview .sheet-steps-table tr')].map(row=>[...row.cells].map(cell=>cell.textContent)))"),true,'every printed table cell matches the preview, including empty fields');
        assert.equal(await evaluate("document.querySelectorAll('#academicPrintDocument .sheet-steps-table thead th').length"),5,'preview has the same five columns in print');
        await evaluate("Promise.all([...document.querySelectorAll('#academicPrintDocument img')].map(image=>image.decode()))");
      }
      assert.equal(await evaluate("document.querySelectorAll('#academicPrintDocument button,#academicPrintDocument details').length"),0);
      if(kind==='mindmap') {
        const branches=await evaluate('MINDMAPS_DATA.find(map=>map.id===activeMapKey).root.branches.length');
        assert.equal(await evaluate("document.querySelectorAll('#academicPrintDocument .map-relations').length"),branches,'every printed branch preserves its concept relationship');
      }
      if(kind==='resources'||kind==='mindmap'||kind==='modules') {
        assert.equal(await evaluate("[...document.querySelectorAll('#academicPrintDocument a[href^=\"#\"]')].every(link=>document.getElementById('academicPrintDocument').querySelector(link.getAttribute('href'))!==null)"),true,'printed contents link to sections inside the print document');
      }
      if(kind==='modules'&&id==='all') {
        assert.equal(await evaluate("document.querySelectorAll('#academicPrintDocument .academic-module').length===CURRICULUM_DATA.length&&!!document.querySelector('#academicPrintDocument .academic-module-cover')"),true,'complete collection includes a cover and every module');
        assert.equal(await evaluate("CURRICULUM_DATA.every(module=>document.querySelector('#print-'+module.id+' .module-body-text').textContent===document.querySelector('#'+module.id+' .module-body-text').textContent)"),true,'all module text is preserved, including hidden lessons');
        assert.equal(await evaluate("document.querySelectorAll('#academicPrintDocument .module-workshop').length"),8,'all applied workshops are included');
        assert.equal(await evaluate("document.querySelectorAll('#academicPrintDocument .workshop-answer li').length"),48,'proposed answers and review criteria are expanded in the PDF');
        assert.equal(await evaluate("document.querySelectorAll('#academicPrintDocument .academic-contents-list a').length"),8);
        assert.equal(await evaluate("[...document.querySelectorAll('#academicPrintDocument .lesson-section')].every(section=>section.id.startsWith('print-mod-'))"),true,'lesson anchors are unique in the print document');
      }
      await send('Emulation.setEmulatedMedia',{media:'print'});
      assert.equal(await evaluate("getComputedStyle(document.documentElement).colorScheme"),'light','printed paper always uses the light color scheme');
      assert.equal(await evaluate("getComputedStyle(document.documentElement).backgroundColor"),'rgb(255, 255, 255)','page margins remain white in dark mode');
      if(kind==='lesson') {
        assert.equal(await evaluate("(()=>{const pages=[...document.styleSheets].flatMap(sheet=>{try{return [...sheet.cssRules]}catch{return []}}).filter(rule=>rule.conditionText==='print').flatMap(rule=>[...rule.cssRules]).filter(rule=>rule.selectorText==='fiche-ar'||rule.selectorText==='fiche-fr');return pages.length===2&&pages.every(rule=>rule.style.margin==='15mm')})()"),true,'both fiche languages use uniform 15 mm page margins');
        assert.equal(await evaluate("getComputedStyle(document.querySelector('#academicPrintDocument .fiche-print-layout > thead')).display"),'table-header-group','whole ministry/classroom header repeats in normal page flow');
        assert.equal(await evaluate("getComputedStyle(document.querySelector('#academicPrintDocument .sheet-signatures')).display"),'flex','preview signatures remain visible');
        assert.equal(await evaluate("(()=>{const image=document.querySelector('#academicPrintDocument .sheet-ministry-logo'),rect=image.getBoundingClientRect();return getComputedStyle(image).objectFit==='contain'&&Math.abs(rect.width/rect.height-image.naturalWidth/image.naturalHeight)<0.02})()"),true,'complete ministry logo is proportional and uncropped');
        assert.equal(await evaluate("getComputedStyle(document.querySelector('#academicPrintDocument .sheet-steps-table td')).fontFamily===getComputedStyle(document.querySelector('#sheetPreview .sheet-steps-table td')).fontFamily"),true,'preview and print use the same typeface');
        assert.equal(await evaluate("parseFloat(getComputedStyle(document.querySelector('#academicPrintDocument .sheet-steps-table td')).fontSize)>=14"),true,'phase text stays at least 10.5pt');
        assert.equal(await evaluate("getComputedStyle(document.querySelector('#academicPrintDocument .fiche-page-header')).position"),'static','repeating header occupies space instead of overlaying lesson content');
        assert.equal(await evaluate("getComputedStyle(document.querySelector('#academicPrintDocument .fiche-print-layout > tbody > tr')).breakInside"),'auto','long lessons can paginate inside the print layout');
        assert.equal(await evaluate("document.querySelector('#academicPrintDocument .fiche-print-layout > thead').getBoundingClientRect().height*25.4/96<45"),true,'ministry header stays below the browser repeating-header height limit');
      }
      const headerHeightMm=kind==='lesson'?await evaluate("document.querySelector('#academicPrintDocument .fiche-page-header').getBoundingClientRect().height*25.4/96"):null;
      const result=await send('Page.printToPDF',{printBackground:true,preferCSSPageSize:true,displayHeaderFooter:false,generateTaggedPDF:true});
      await send('Emulation.setEmulatedMedia',{media:''});
      const bytes=Buffer.from(result.data,'base64');
      const filename=path.join(artifacts,name+'.pdf');fs.writeFileSync(filename,bytes);
      const pdfSource=bytes.toString('latin1');
      const pageCount=[...pdfSource.matchAll(/\/Type\s*\/Page\b/g)].length;
      const boxes=[...pdfSource.matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map(match=>[Number(match[1]),Number(match[2])]);
      assert(pageCount>0&&boxes.length>0,'PDF contains pages');
      assert(boxes.every(([w,h])=>Math.abs(Math.min(w,h)-595.28)<2&&Math.abs(Math.max(w,h)-841.89)<2),'every page uses A4');
      if(name==='resources-comparison') assert.equal(pageCount,1,'standard comparison fits one page');
      if(name==='resources-long-comparison') assert(pageCount>1,'extended comparison paginates instead of shrinking its text');
      if(name==='fiche-fr-informatics'||name==='fiche-fr-informatics-dark') assert.equal(pageCount,1,'short computing lesson, all four phases and signatures fit one A4 page');
      if(kind==='lesson'&&!name.includes('long')) assert(pageCount<=3,'preview layout paginates without shrinking its text');
      if(name==='fiche-long') assert(pageCount>1,'long fields paginate');
      if(kind==='mindmap') {
        const branches=await evaluate('MINDMAPS_DATA.find(map=>map.id===activeMapKey).root.branches.length');
        if(name!=='map-long-branch') assert(pageCount<=branches+2,'one overview plus branch and reference pages');
        else assert(pageCount>branches+2,'long explanations continue onto additional portrait pages');
        assert(boxes[0][0]>boxes[0][1],'overview uses landscape');
        assert(boxes.slice(1).every(([w,h])=>w<h),'branch explanations use portrait');
      }
      if(kind==='lesson') assert(boxes.every(([w,h])=>w>h),'five-column fiche uses landscape A4');
      if(kind==='modules'&&id==='all') {
        assert(pageCount>=10,'cover, contents and each module have separate pages');
        assert(boxes.every(([w,h])=>w<h),'complete collection uses portrait A4');
      }
      await waitFor("!document.getElementById('academicPrintDocument')");
      assert.equal(await evaluate('document.title'),title,'title restored');
      assert.equal(await evaluate("document.body.classList.contains('academic-printing')"),false,'print state restored');
      assert.equal(await evaluate("document.getElementById('fichePrintPageStyle')===null"),true,'page-header sizing is cleaned up');
      const expectedHeader=kind==='lesson'?{...await evaluate("({heading:ficheText().documentKind,language:ficheLanguage})"),header:repeatedHeader,heightMm:headerHeightMm}:null;
      manifest.push({name,filename,pages:pageCount,characters:content.length,expectedHeader});
      console.log('PASS '+name+'; '+pageCount+' A4 pages; '+content.length+' content characters');
    };
    if (!process.argv.includes('--study')) {
      await load('/pages/fiche-generator.html','sheetReady');
      await evaluate("loadPreset('science',false)");
      await pdf('fiche-science','lesson');
      const nativeTitle=await evaluate('document.title');
      await send('Emulation.setEmulatedMedia',{media:'print'});
      await evaluate("window.dispatchEvent(new Event('beforeprint'))");
      await pdf('fiche-native','lesson',undefined,nativeTitle);
      await evaluate("applyTheme('dark')");await pdf('fiche-dark','lesson');
      assert.equal(await evaluate("document.documentElement.dataset.theme"),'dark','theme survives printing');
      assert.equal(await evaluate("getComputedStyle(document.documentElement).colorScheme"),'dark','screen color scheme returns after printing');
      await evaluate("applyTheme('light')");
      await evaluate("loadPreset('math',false)");
      await pdf('fiche-math','lesson');
      await evaluate("document.getElementById('inLanguage').value='fr';changeFicheLanguage();loadPreset('science',false)");
      await pdf('fiche-fr-science','lesson');
      assert.equal(await evaluate("document.getElementById('sheetPreview').dir"),'ltr');
      await evaluate("loadPreset('math',false)");await pdf('fiche-fr-math','lesson');
      await evaluate("loadPreset('lang',false);document.getElementById('inLevel').value='bac2';renderSheet()");await pdf('fiche-fr-lycee','lesson');
      for(const subject of ['physics','french','informatics']) {
        await evaluate(`loadPreset('${subject}',false)`);await pdf('fiche-fr-'+subject,'lesson');
      }
      await evaluate("applyTheme('dark');document.getElementById('inSchool').value='Collège de test';document.getElementById('inTeacher').value='Enseignant de test';document.getElementById('inSessionDate').value='2026-10-17';document.getElementById('inDuration').value='60 minutes';renderSheet()");
      await pdf('fiche-fr-informatics-dark','lesson');
      await evaluate("document.getElementById('inTitle').value='Analyser une situation, construire un algorithme et vérifier les résultats dans plusieurs cas. '.repeat(2);renderSheet()");
      await pdf('fiche-long-title','lesson');
      await evaluate("loadPreset('informatics',false)");
      await evaluate("applyTheme('light');document.getElementById('inSchool').value='';document.getElementById('inTeacher').value='';document.getElementById('inSessionDate').value='';document.getElementById('inDuration').value='';renderSheet()");
      await evaluate("document.getElementById('inStudent1').value='';renderSheet()");await pdf('fiche-fr-incomplete','lesson');
      assert.equal(await evaluate("document.getElementById('inStudent1').value"),'','printing keeps an explicitly empty activity unchanged');
      await evaluate("document.getElementById('inSchool').value='Établissement scolaire avec un nom particulièrement long. '.repeat(6);document.getElementById('inTeacher').value='Enseignant avec plusieurs noms de famille. '.repeat(3);renderSheet()");
      await pdf('fiche-long-metadata','lesson');
      await evaluate("AcademicPrint.prepare('lesson')");
      assert.equal(await evaluate("document.querySelector('#academicPrintDocument .fiche-page-header .sheet-context-grid')===null&&document.querySelector('#academicPrintDocument .fiche-print-sheet > .sheet-context-grid')!==null"),true,'long classroom details stay complete below the repeating ministry header');
      await evaluate("AcademicPrint.cleanup();document.getElementById('inSchool').value='';document.getElementById('inTeacher').value='';renderSheet()");
      await evaluate("document.getElementById('inLanguage').value='ar';changeFicheLanguage();loadPreset('math',false)");
      await evaluate(`document.getElementById('inObjectives').value=Array.from({length:32},(_,i)=>(i+1)+'. هدف تعلمي مطول للتحقق من سلامة فواصل الصفحات وسهولة قراءة الجذاذة.').join('\\n');document.getElementById('inStep2').value='نشاط تربوي مفصل. '.repeat(130);renderSheet()`);
      await pdf('fiche-long','lesson');
      assert.equal(await evaluate("document.getElementById('outObjectives').textContent.includes('32.')"),true,'fields survive printing');
      await evaluate("document.getElementById('inLanguage').value='fr';changeFicheLanguage();loadPreset('informatics',false);document.getElementById('inStep2').value='Expliquer la démarche, comparer les résultats et justifier les choix. '.repeat(70);renderSheet()");
      await pdf('fiche-long-fr','lesson');
    }
    await load('/pages/resources.html');
    await evaluate('collapseAllResCards()');
    const collapsed=await evaluate("[...document.querySelectorAll('.res-card-body')].every(el=>el.style.display==='none')");assert.equal(collapsed,true);
    await pdf('resources-all','resources');
    assert.equal(await evaluate("[...document.querySelectorAll('.res-card-body')].every(el=>el.style.display==='none')"),true,'collapsed cards stay collapsed');
    await evaluate("document.getElementById('resSearchInput').value=RESOURCES_DATA.items.find(item=>item.matrixData).title;renderResources()");
    assert.equal(await evaluate("document.querySelectorAll('.res-card').length"),1);
    await pdf('resources-comparison','resources');
    const comparisonRows=await evaluate("document.querySelector('.res-card .matrix-table tbody').innerHTML");
    await evaluate("(()=>{const tbody=document.querySelector('.res-card .matrix-table tbody');tbody.innerHTML=Array.from({length:5},()=>tbody.innerHTML).join('')})()");
    await pdf('resources-long-comparison','resources');
    await evaluate(`document.querySelector('.res-card .matrix-table tbody').innerHTML=${JSON.stringify(comparisonRows)}`);
    await fill('resSearchInput','no-resource-matches-this');
    assert.equal(await evaluate("document.querySelector('[data-click=\"printAcademicDocument\"]').disabled"),true,'empty export disabled');
    await load('/pages/mindmaps.html',"document.querySelectorAll('.map-node').length>0");
    for (const id of await evaluate('MINDMAPS_DATA.map(map=>map.id)')) {
      await evaluate(`switchMap('${id}');setMindmapLayout('recall');document.getElementById('mapSearchInput').value='لا توجد نتائج';renderCurrentMindmap()`);
      await pdf(id,'mindmap');
      assert.equal(await evaluate('currentLayoutMode'),'recall','reader layout preserved');
      assert.equal(await evaluate("document.getElementById('mapSearchInput').value"),'لا توجد نتائج','reader query preserved');
    }
    await evaluate("switchMap('map-theories');MINDMAPS_DATA[0].root.branches[0].example.action+=' شرح تربوي مطول لاختبار استمرار النص عبر الصفحات دون بتر المحتوى أو تصغير الخط.'.repeat(80)");
    await pdf('map-long-branch','mindmap');
    await load('/pages/modules.html',"document.querySelectorAll('.module-accordion').length===8");
    for(const id of ['mod-1','mod-3','mod-7']) {
      await evaluate(`setModuleOpen(document.getElementById('${id}'),false)`);
      await pdf('module-'+id,'modules',id);
      assert.equal(await evaluate(`document.querySelector('#${id} .accordion-body').hidden`),true,'closed module stays closed');
    }
    await evaluate("document.getElementById('moduleCategory').value=CURRICULUM_DATA[0].badge;filterModules();toggleAccordion('mod-1')");
    const moduleState=await evaluate("JSON.stringify({category:document.getElementById('moduleCategory').value,open:[...document.querySelectorAll('.module-accordion.open')].map(item=>item.id)})");
    await pdf('modules-complete','modules','all');
    assert.equal(await evaluate("JSON.stringify({category:document.getElementById('moduleCategory').value,open:[...document.querySelectorAll('.module-accordion.open')].map(item=>item.id)})"),moduleState,'complete PDF preserves filters and disclosures');
    step='native print lifecycle and PDF button';
    await load('/pages/resources.html');
    await evaluate("document.dispatchEvent(new Event('beforeprint'));window.dispatchEvent(new Event('beforeprint'))");
    assert.equal(await evaluate("document.querySelectorAll('#academicPrintDocument').length"),1);
    await evaluate("window.dispatchEvent(new Event('afterprint'))");
    assert.equal(await evaluate("document.querySelectorAll('#academicPrintDocument').length"),0);
    await evaluate("window.print=()=>{window.printCalls=(window.printCalls||0)+1;window.dispatchEvent(new Event('beforeprint'));window.dispatchEvent(new Event('afterprint'))};printAcademicDocument()");
    assert.equal(await evaluate('window.printCalls'),1);
    assert.deepEqual(errors,[],'Browser exceptions');assert.deepEqual(violations,[],'CSP violations');
    fs.writeFileSync(path.join(artifacts,'manifest.json'),JSON.stringify(manifest,null,2));
    console.log('Print checks passed. PDF samples: '+artifacts);
  } catch (error) { console.error('Print artifacts: '+artifacts); error.message = step+': '+error.message; throw error; }
  finally {
    if(socket)socket.close();if(chrome){chrome.kill();await delay(1000);}
    for(const cleanup of cleanups.reverse())await cleanup();
  }
}
printSmoke().catch(error=>{console.error(error);process.exitCode=1;});
