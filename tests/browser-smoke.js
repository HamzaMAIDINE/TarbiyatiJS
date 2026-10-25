'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { fixture, verificationCode } = require('./helpers');
const delay = ms => new Promise(resolve => setTimeout(resolve,ms));

async function browserSmoke() {
  const executable = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/google-chrome','/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(filename=>fs.existsSync(filename));
  if (!executable) throw new Error('Set CHROME_PATH to a Chrome/Chromium/Edge executable for browser tests.');
  const cleanups = []; let clockOffset = 0;
  const f = await fixture({after:fn=>cleanups.push(fn)},{now:()=>Date.now()+clockOffset, adminEmails:['browser-admin@example.test']});
  const artifacts = fs.mkdtempSync(path.join(os.tmpdir(),'tarbiyati-browser-artifacts-'));
  let chrome, socket; let step = 'startup'; const errors = [], violations = [];
  try {
    const profile = path.join(f.directory,'chrome');
    chrome = spawn(executable,['--headless=new','--mute-audio','--remote-debugging-port=0','--user-data-dir='+profile,
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
    const waitFor=async(expression,label=expression)=>{for(let i=0;i<180;i++){await delay(100);try{if(await evaluate(expression))return;}catch{}}let geometry;try{geometry=await evaluate("JSON.stringify({scrollY,viewport:innerHeight,height:document.documentElement.scrollHeight,quizTop:document.getElementById('quizContainer')?.getBoundingClientRect().top,headerBottom:document.querySelector('.site-topbar')?.getBoundingClientRect().bottom})");}catch{}throw new Error('Waiting for '+label+' during '+step+(geometry?' '+geometry:''));};
    const navigate=async(route,ready)=>{await waitFor('typeof progressPending===\'undefined\'||progressPending===0','pending progress saved before navigation');await send('Page.navigate',{url:f.origin+route});await waitFor(`location.pathname===${JSON.stringify(route.split('?')[0].split('#')[0]||'/')}&&document.readyState==='complete'&&document.documentElement.dataset.auth!=='loading'`,'page readiness');if(ready)await waitFor(ready);};
    // Navigation must not destroy the CDP evaluation context or interrupt a save.
    const click=async selector=>{if(await evaluate(`(()=>{const target=document.querySelector(${JSON.stringify(selector)});return target?.tagName==='A'&&new URL(target.href).pathname!==location.pathname;})()`))await waitFor('typeof progressPending===\'undefined\'||progressPending===0','pending progress saved before navigation');return evaluate(`(()=>{const target=document.querySelector(${JSON.stringify(selector)});if(target.tagName==='A'&&new URL(target.href).pathname!==location.pathname){setTimeout(()=>target.click(),0);return true;}target.click();return true;})()`);};
    const fill=(id,value)=>evaluate(`(()=>{const input=document.getElementById(${JSON.stringify(id)});input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    const screenshot=async name=>{await delay(300);const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(shot.data,'base64'));};
    const panelAtTop=selector=>`Math.abs(document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().top-document.querySelector('.site-topbar').getBoundingClientRect().bottom-16)<3`;
    const checkReviewFilters = async (controls, list, counts) => {
      const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
      for (const [filter, count] of Object.entries(counts)) {
        if (filter === 'review' && !count) continue;
        await click(`#${controls} [data-review-filter="${filter}"]`);
        assert.equal(await evaluate(`document.querySelectorAll('#${list} > :not([hidden])').length`), count, `${filter} review count`);
        assert.equal(await evaluate(`document.querySelector('#${controls} .assessment-review-empty').hidden`), count > 0);
      }
      await click(`#${controls} [data-review-filter="all"]`);
      assert.equal(await evaluate(`document.querySelectorAll('#${list} > :not([hidden])').length`), total, 'all questions remain available');
    };
    const checkExpiryRetry = async page => {
      const quiz = page === 'quiz';
      const deadline = quiz ? 'timerDeadline' : 'examAttempt.deadline';
      const offset = quiz ? 'serverClockOffset' : 'examClockOffset';
      const flag = quiz ? 'quizExpiryAttempted' : 'examExpiryAttempted';
      const update = quiz ? 'updateTimerBadge' : 'updateExamTimer';
      const busy = quiz ? 'quizBusy' : 'examBusy';
      const error = quiz ? 'quizRequestError' : 'examError';
      await evaluate(`(()=>{window.expiryDeadline=${deadline};window.expiryRequest=accountRequest;window.expiryCalls=0;accountRequest=async(endpoint,body)=>{if(endpoint==='/api/quizzes/submit'){window.expiryCalls++;throw Object.assign(new Error('Submission temporarily unavailable'),{status:503});}return window.expiryRequest(endpoint,body);};${deadline}=Date.now()+${offset}-1000;${flag}=false;${update}();})()`);
      await waitFor(`!${busy}&&!document.getElementById('${error}').hidden`);
      await evaluate(`(()=>{for(let index=0;index<5;index++)${update}();})()`);
      await delay(150);
      assert.equal(await evaluate('window.expiryCalls'), 1, 'failed expiry submission does not retry every second');
      await click(quiz ? '#quizRequestRetry' : '#examRetry');
      await waitFor(`!${busy}&&window.expiryCalls===2`);
      await evaluate(`(()=>{accountRequest=window.expiryRequest;${deadline}=window.expiryDeadline;${flag}=false;document.getElementById('${error}').hidden=true;${quiz ? 'quizControls' : 'examSetBusy'}(false);${update}();})()`);
    };
    await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Log.enable');
    await send('Network.setBlockedURLs',{urls:['*fonts.googleapis.com*','*fonts.gstatic.com*']});
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});

    step='registration and theme';
    await navigate('/pages/account.html?mode=register');
    await fill('accountName','Browser learner');await fill('accountEmail','browser@example.test');await fill('accountPassword','Browser-learner-password');
    await click('#passwordVisibility');assert.equal(await evaluate("document.getElementById('accountPassword').type"),'text');
    await click('#passwordVisibility');await click('#accountSubmit');
    await waitFor("accountMode==='pending'&&!document.getElementById('signupVerification').hidden");
    assert.equal(await evaluate("location.pathname"),'/pages/account.html');
    assert.equal(await evaluate("document.getElementById('accountForm').hidden"),true);
    assert.equal(await evaluate("document.querySelector('[data-signup-step=\"2\"]').getAttribute('aria-current')"),'step');
    assert.equal(await evaluate("document.getElementById('verificationResend').disabled"),true);
    assert.equal(await evaluate("fetch('/api/progress').then(response=>response.status)"),403);
    await send('Page.navigate',{url:f.origin+'/pages/dashboard.html'});
    await waitFor("location.pathname==='/pages/account.html'&&accountMode==='pending'&&document.documentElement.dataset.auth==='verification'");
    await send('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:1,mobile:true});
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true,'Signup verification mobile overflow');
    await screenshot('signup-verification-mobile');
    clockOffset += 60001; await click('#verificationCheck');
    await waitFor("!verificationChecking&&!document.getElementById('verificationResend').disabled");
    await click('#verificationResend');await waitFor('!verificationResending');await f.app.flushMail();
    const verification=f.messages.findLast(message=>message.to==='browser@example.test');
    const proof=verificationCode(verification);
    await fill('verificationCode',proof === '000000' ? '000001' : '000000');await click('#verificationSubmit');
    await waitFor("!verificationSubmitting&&!document.getElementById('accountError').hidden");
    assert.equal(await evaluate('accountMode'),'pending','incorrect code keeps the confirmation form available');
    await fill('verificationCode',proof.replace(/[0-9]/g,digit=>String.fromCharCode(0x0660+Number(digit))));
    assert.equal(await evaluate("document.getElementById('verificationCode').value"),proof,'Arabic digits normalize to ASCII');
    await click('#verificationSubmit');
    await waitFor("location.pathname==='/pages/dashboard.html'&&document.documentElement.dataset.auth==='ready'");
    const user=await evaluate('AccountManager.user');assert.equal(user.email,'browser@example.test');
    const originalTheme=await evaluate("document.documentElement.getAttribute('data-theme')");await click('#themeToggleBtn');
    assert.notEqual(await evaluate("document.documentElement.getAttribute('data-theme')"),originalTheme);
    await click('#themeToggleBtn');console.log('PASS signup verification, gated access, resend cooldown, password visibility and theme');

    step='desktop/mobile navigation under CSP';
    for(const route of ['/','/pages/dashboard.html','/pages/modules.html','/pages/quiz.html','/pages/exams.html','/pages/simulator.html','/pages/mindmaps.html',
      '/pages/flashcards.html','/pages/resources.html','/pages/glossary.html','/pages/fiche-generator.html','/pages/settings.html']) {
      await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
      await navigate(route,route.includes('quiz.html')?'activeQuestions.length>0':route.includes('exams.html')?'examLibrary.length===3&&!examBusy':route.includes('fiche-generator')?'sheetReady':undefined);
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true,route+' desktop overflow');
      assert.equal(await evaluate("document.querySelectorAll('[onclick],[oninput],[onchange]').length"),0,route+' inline attributes');
      assert.equal(await evaluate("document.querySelector('[data-click^=\"speak\"], [data-term-speak], [data-speech-player], audio')===null"),true,route+' has no voice controls');
      await send('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:1,mobile:true});await delay(100);
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true,route+' mobile overflow');
      if(route.startsWith('/pages/')) {
        await click('.menu-trigger');assert.equal(await evaluate("document.body.classList.contains('menu-open')"),true);
        if(route==='/pages/dashboard.html') {
          assert.equal(await evaluate("document.querySelector('.logout-button').getBoundingClientRect().bottom<=innerHeight"),true,'learning sidebar logout remains visible');
          await screenshot('learning-sidebar-mobile');
        }
        await click('.sidebar-close');assert.equal(await evaluate("document.body.classList.contains('menu-open')"),false);
        await click('.global-search-trigger');await waitFor("document.body.classList.contains('search-open')");
        await fill('globalQuickSearchInput','QCM');await click('.search-modal-close-btn');
      }
    }
    console.log('PASS 12 pages at desktop and phone widths, navigation and search under CSP');

    step='focused module reading, expand all and complete PDF export';
    await navigate('/pages/modules.html',"document.querySelectorAll('.module-accordion').length===8");
    await click('#heading-mod-1');await click('#heading-mod-2');
    assert.deepEqual(await evaluate("[...document.querySelectorAll('.module-accordion.open')].map(item=>item.id)"),['mod-2'],'opening a module collapses the previous one');
    await waitFor("document.getElementById('body-mod-1').hidden");
    assert.equal(await evaluate("document.getElementById('heading-mod-1').getAttribute('aria-expanded')==='false'&&document.getElementById('body-mod-1').hidden"),true);
    await click('#expandAllModulesBtn');
    assert.equal(await evaluate("document.querySelectorAll('.module-accordion.open').length"),8);
    assert.equal(await evaluate("document.getElementById('expandAllModulesBtn').disabled"),true);
    await click('#heading-mod-3');
    assert.equal(await evaluate("document.querySelectorAll('.module-accordion.open').length"),7,'individual modules can close after expanding all');
    await click('#heading-mod-3');
    assert.deepEqual(await evaluate("[...document.querySelectorAll('.module-accordion.open')].map(item=>item.id)"),['mod-3']);
    await click('#collapseAllModulesBtn');
    assert.equal(await evaluate("document.querySelectorAll('.module-accordion.open').length"),0);
    await evaluate("document.getElementById('moduleCategory').value=CURRICULUM_DATA[0].badge;filterModules()");
    await click('#expandAllModulesBtn');
    assert.deepEqual(await evaluate("[...document.querySelectorAll('.module-accordion.open')].map(item=>item.id)"),['mod-1'],'expand all respects the current filter');
    await evaluate("window.print=()=>{window.printedModules={ids:[...document.querySelectorAll('#academicPrintDocument .academic-module')].map(item=>item.id),cover:!!document.querySelector('#academicPrintDocument .academic-module-cover'),contents:document.querySelectorAll('#academicPrintDocument .academic-contents-list a').length};window.dispatchEvent(new Event('afterprint'))}");
    await click('[data-click="printAllModules"]');await waitFor('!!window.printedModules');
    assert.deepEqual(await evaluate('window.printedModules'),{ids:Array.from({length:8},(_,index)=>'print-mod-'+(index+1)),cover:true,contents:8},'complete PDF includes hidden modules, a cover and linked contents');
    assert.equal(await evaluate("document.getElementById('moduleCategory').value===CURRICULUM_DATA[0].badge&&document.querySelectorAll('.module-accordion.open').length===1&&!document.getElementById('academicPrintDocument')"),true,'export preserves filters and reading state');
    await evaluate("location.hash='#mod-7'");await waitFor("document.getElementById('mod-7').classList.contains('open')");
    assert.deepEqual(await evaluate("[...document.querySelectorAll('.module-accordion.open')].map(item=>item.id)"),['mod-7'],'deep links open only their target');
    await evaluate("location.hash='#mod-1-s5'");
    await waitFor("document.activeElement.id==='mod-1-s5'&&document.getElementById('mod-1').classList.contains('open')");
    await waitFor(panelAtTop('#mod-1-s5'), 'exact lesson aligned below sticky header');
    assert.deepEqual(await evaluate("[...document.querySelectorAll('.module-accordion.open')].map(item=>item.id)"),['mod-1']);
    assert.equal(await evaluate("document.querySelectorAll('#mod-1 .module-contents a').length"),6);
    assert.equal(await evaluate("document.querySelector('#mod-1-s5 .lesson-sources a').getAttribute('href').includes('#page=')"),true);
    assert.equal(await evaluate("CURRICULUM_DATA.every(module=>module.sections.every(section=>section.objectives.length&&section.selfCheck.answer))"),true);
    assert.equal(await evaluate("document.querySelectorAll('.module-workshop').length"),8,'every module includes an applied workshop');
    assert.equal(await evaluate("document.querySelectorAll('.module-workshop > ol > li').length"),24,'workshops provide three analysis tasks each');
    assert.equal(await evaluate("document.querySelector('#mod-1 .workshop-answer').open"),false,'workshop explanation starts hidden');
    await click('#mod-1 .workshop-answer summary');
    assert.equal(await evaluate("document.querySelector('#mod-1 .workshop-answer').open"),true);
    assert.equal(await evaluate("document.querySelector('#mod-1 .workshop-links > a').getAttribute('href')"),'mindmaps.html#map-practice/b-practice-equity');
    await click('#mod-1 .workshop-answer summary');
    assert.equal(await evaluate("document.querySelector('#mod-1-s5 .lesson-answer').open"),false,'self-check answer starts hidden');
    await click('#mod-1-s5 .lesson-answer summary');
    assert.equal(await evaluate("document.querySelector('#mod-1-s5 .lesson-answer').open"),true);
    await click('#mod-1-s5 .lesson-answer summary');
    await screenshot('module-expanded-sources-mobile');
    const lessonSourceURL = await evaluate("document.querySelector('#mod-1-s5 .lesson-sources a').getAttribute('href').split('#')[0]");
    const sourceResponse = await fetch(f.origin + lessonSourceURL);
    assert.equal(sourceResponse.status,200); assert.match(sourceResponse.headers.get('content-type'), /application\/pdf/);
    assert.equal(new TextDecoder().decode((await sourceResponse.arrayBuffer()).slice(0,5)),'%PDF-');
    await fill('moduleSearchInput','برنشتاين');
    assert.equal(await evaluate("document.getElementById('mod-1').hidden"),false,'expanded lesson content is searchable');
    await evaluate("location.hash='#mod-3-s7'");
    await waitFor("location.hash==='#mod-2-s9'&&document.activeElement.id==='mod-2-s9'");
    await waitFor(panelAtTop('#mod-2-s9'),'moved intelligence lesson opens in psychology');
    assert.deepEqual(await evaluate("[...document.querySelectorAll('.module-accordion.open')].map(item=>item.id)"),['mod-2']);
    await evaluate("location.hash='#mod-1-s3'");
    await waitFor("location.hash==='#mod-4-s1'&&document.activeElement.id==='mod-4-s1'");
    await waitFor(panelAtTop('#mod-4-s1'),'moved competency lesson opens in pedagogy');
    await evaluate("collapseAllModules();clearModuleFilters()");
    await waitFor("[...document.querySelectorAll('.accordion-body')].every(panel=>panel.hidden)");
    await screenshot('modules-mobile');
    console.log('PASS one module at a time, expand/collapse all, filtered expansion, deep links, full PDF button and removed voice controls');

    step='module disclosure motion';
    await click('#heading-mod-1');
    const openingModule = await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{const panel=document.getElementById('body-mod-1');resolve({height:panel.getBoundingClientRect().height,full:panel.scrollHeight});})))");
    assert(openingModule.height>0&&openingModule.height<openingModule.full,'module passes through an intermediate opening height');
    await waitFor("!document.getElementById('body-mod-1').classList.contains('is-animating')");
    assert.equal(await evaluate("Math.abs(document.getElementById('body-mod-1').getBoundingClientRect().height-document.getElementById('body-mod-1').scrollHeight)<1"),true,'long lessons finish at their natural height');
    await waitFor(panelAtTop('#mod-1'),'opened module aligned below the header');
    await click('#heading-mod-1');
    assert.equal(await evaluate("document.getElementById('body-mod-1').inert&&!document.getElementById('body-mod-1').hidden"),true,'closing content is immediately removed from keyboard navigation while it animates');
    await click('#heading-mod-1');await click('#heading-mod-1');await click('#heading-mod-1');
    await waitFor("!document.getElementById('body-mod-1').classList.contains('is-animating')");
    assert.equal(await evaluate("!document.getElementById('body-mod-1').hidden&&!document.getElementById('body-mod-1').inert&&document.getElementById('heading-mod-1').getAttribute('aria-expanded')==='true'"),true,'rapid reversals settle in the requested state');
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await click('#heading-mod-1');
    assert.equal(await evaluate("document.getElementById('body-mod-1').hidden&&!document.getElementById('body-mod-1').classList.contains('is-animating')"),true,'reduced motion closes immediately');
    await send('Emulation.setEmulatedMedia',{features:[]});
    console.log('PASS module height animation, long content, rapid reversal and reduced motion');

    step='expanded module scroll position';
    for(const width of [1440,375]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:812,deviceScaleFactor:1,mobile:width<=800});
      await click('#heading-mod-1');
      await waitFor(panelAtTop('#mod-1'),`module scroll at ${width}px`);
      await evaluate("document.getElementById('heading-mod-7').scrollIntoView({behavior:'instant',block:'center'})");
      await click('#heading-mod-7');
      await waitFor(panelAtTop('#mod-7'),`module scroll after closing a long panel above it at ${width}px`);
      assert.equal(await evaluate("document.getElementById('body-mod-1').hidden"),true);
      await click('#heading-mod-7');
      await waitFor("document.getElementById('body-mod-7').hidden");
    }
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await click('#heading-mod-1');
    await waitFor(panelAtTop('#mod-1'),'instant module scroll with reduced motion');
    await click('#heading-mod-1');
    await send('Emulation.setEmulatedMedia',{features:[]});
    console.log('PASS expanded modules scroll below the header on desktop/mobile, after sibling collapse and with reduced motion');

    step='mind map disclosure motion';
    await navigate('/pages/mindmaps.html',"!!document.querySelector('.map-node')");
    await evaluate("window.firstMapNode=document.querySelector('.map-node');window.secondMapBranch=document.querySelectorAll('.map-node')[1].dataset.branchId");
    await click('.map-node:nth-of-type(2)');
    assert.equal(await evaluate("document.querySelector('.map-node')===window.firstMapNode&&document.querySelector('.map-node[data-selected=\"true\"]').dataset.branchId===window.secondMapBranch"),true,'selecting a diagram box preserves the nodes for smooth color transitions');
    assert.equal(await evaluate("document.querySelector('#selectedMapBranch h3').textContent===MINDMAPS_DATA[0].root.branches.find(branch=>branch.id===window.secondMapBranch).title"),true,'selected box displays its matching explanation');
    await waitFor(panelAtTop('#selectedMapBranch'),'selected mind map explanation scrolled into view');
    await click('.map-recall-check > summary');
    await waitFor("!document.querySelector('.disclosure-panel.is-animating')");
    await click('.map-node:first-of-type');await click('.map-node:nth-of-type(2)');
    assert.equal(await evaluate("document.querySelector('.map-recall-check').open"),true,'diagram selection preserves the open answer for each box');
    await click('.map-recall-check > summary');
    await click('.map-node:first-of-type');
    await evaluate("setMindmapLayout('study');document.querySelectorAll('.map-study-branch > summary')[1].focus()");
    assert.equal(await evaluate("document.activeElement===document.querySelectorAll('.map-study-branch > summary')[1]"),true,'branch summary receives focus');
    await send('Emulation.setFocusEmulationEnabled',{enabled:true});
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    const openingBranch = await evaluate("new Promise(resolve=>{let frames=0;const sample=()=>{const detail=document.querySelectorAll('.map-study-branch')[1],panel=detail.querySelector(':scope > .disclosure-panel'),state={expanded:detail.querySelector('summary').getAttribute('aria-expanded'),height:panel.getBoundingClientRect().height,full:panel.scrollHeight};if(state.height>0&&state.height<state.full||++frames>=15)resolve(state);else requestAnimationFrame(sample);};requestAnimationFrame(sample);})");
    assert.equal(openingBranch.expanded,'true','native summaries support keyboard activation');
    assert.deepEqual(await evaluate("[...document.querySelectorAll('.map-study-branch')].map((detail,index)=>DisclosureMotion.isDetailsOpen(detail)?index:null).filter(index=>index!==null)"),[1],'opening a branch closes the previous branch immediately');
    assert(openingBranch.height>0&&openingBranch.height<openingBranch.full,'mind map boxes animate through an intermediate height: '+JSON.stringify(openingBranch));
    await waitFor("!document.querySelector('.disclosure-panel.is-animating')");
    assert.equal(await evaluate("document.querySelectorAll('.map-study-branch[open]').length"),1,'only one branch remains open after the transition');
    await waitFor(panelAtTop('.map-study-branch:nth-of-type(2)'),'expanded mind map branch scrolled below the header');
    await click('.map-study-branch:nth-of-type(2) .map-recall-check > summary');
    await waitFor("!document.querySelector('.disclosure-panel.is-animating')");
    assert.equal(await evaluate("document.querySelectorAll('.map-study-branch')[1].querySelector('.map-recall-check').open"),true,'nested recall answers expand independently');
    assert.equal(await evaluate("document.querySelectorAll('.map-study-branch')[1].open"),true,'opening an answer keeps its parent branch open');
    await evaluate("collapseAllBranches();setMindmapLayout('map');setMindmapLayout('study')");
    assert.equal(await evaluate("[...document.querySelectorAll('.map-study-branch')].every(detail=>!detail.open)"),true,'switching views during collapse preserves the intended closed state');
    await evaluate('expandAllBranches()');
    await waitFor("!document.querySelector('.disclosure-panel.is-animating')");
    assert.equal(await evaluate("[...document.querySelectorAll('.map-study-branch')].every(detail=>detail.open&&!detail.querySelector(':scope > .disclosure-panel').hidden)"),true,'expand all finishes with every branch visible');
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true,'expanded mind map mobile overflow');
    await waitFor(panelAtTop('.map-study-branch'),'bulk expansion scrolls to the first mind map branch');
    await screenshot('mindmap-study-mobile');
    await click('.map-study-branch:nth-of-type(2) > summary');
    await waitFor("!document.querySelector('.disclosure-panel.is-animating')");
    assert.equal(await evaluate("document.querySelectorAll('.map-study-branch[open]').length"),5,'closing one branch after Open all keeps the others open');
    await click('.map-study-branch:nth-of-type(2) > summary');
    await waitFor("!document.querySelector('.disclosure-panel.is-animating')");
    assert.deepEqual(await evaluate("[...document.querySelectorAll('.map-study-branch')].map((detail,index)=>detail.open?index:null).filter(index=>index!==null)"),[1],'reopening a branch after Open all returns to a single open branch');
    await click('.map-study-branch:nth-of-type(3) > summary');
    await click('.map-study-branch:nth-of-type(5) > summary');
    await waitFor("!document.querySelector('.disclosure-panel.is-animating')");
    assert.deepEqual(await evaluate("[...document.querySelectorAll('.map-study-branch')].map((detail,index)=>detail.open?index:null).filter(index=>index!==null)"),[4],'rapid branch changes settle on the last branch');
    await waitFor(panelAtTop('.map-study-branch:nth-of-type(5)'),'last opened branch scrolls below the header');
    await evaluate("setMindmapLayout('map');setMindmapLayout('study')");
    assert.deepEqual(await evaluate("[...document.querySelectorAll('.map-study-branch')].map((detail,index)=>detail.open?index:null).filter(index=>index!==null)"),[4],'switching views preserves only the chosen branch');
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await evaluate("collapseAllBranches();setMindmapLayout('recall')");
    await click('.map-recall-card details > summary');
    assert.equal(await evaluate("document.querySelector('.map-recall-card details').open&&!document.querySelector('.disclosure-panel.is-animating')"),true,'recall cards open immediately with reduced motion');
    await click('.map-recall-card details > summary');
    assert.equal(await evaluate("!document.querySelector('.map-recall-card details').open"),true,'recall cards close with reduced motion');
    await send('Emulation.setEmulatedMedia',{features:[]});
    console.log('PASS mind map height animation, one branch at a time, keyboard controls, nested answers, view state, bulk actions and reduced motion');

    step='applied mind map, concept relationships and exact lesson navigation';
    await navigate('/pages/mindmaps.html#map-practice/b-practice-institution', "activeMapKey==='map-practice'&&mapSelections.get(activeMapKey)==='b-practice-institution'");
    assert.equal(await evaluate("document.querySelectorAll('#mindmapLibrary button').length"),5);
    assert.equal(await evaluate("document.querySelectorAll('.map-node').length"),8);
    assert.equal(await evaluate("document.querySelector('#selectedMapBranch .map-reading-footer a').getAttribute('href')"),'modules.html#mod-8-s4');
    assert.equal(await evaluate("document.querySelector('#selectedMapBranch .map-recall-check').open"),false);
    await waitFor(panelAtTop('#selectedMapBranch'),'deep-linked concept visible below the header');
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true,'new map fits phone width');
    await screenshot('mindmap-practice-mobile');
    await click('#selectedMapBranch .map-relations a');
    await waitFor("mapSelections.get(activeMapKey)==='b-practice-equity'&&location.hash==='#map-practice/b-practice-equity'");
    assert.equal(await evaluate("document.activeElement.id"),'selectedMapBranch','concept navigation transfers keyboard focus');
    await fill('mapSearchInput','تنسيقاً وشراكة');
    assert.equal(await evaluate("document.querySelectorAll('.map-node').length"),1,'concept relationship text is searchable');
    await evaluate("setMindmapLayout('recall');location.hash='#map-practice/b-practice-institution'");
    await waitFor("currentLayoutMode==='map'&&mapSelections.get(activeMapKey)==='b-practice-institution'");
    assert.equal(await evaluate("document.getElementById('mapSearchInput').value"),'','branch links clear a filter that would hide their target');
    assert.equal(await evaluate("document.querySelector('[data-map-view=\"map\"]').getAttribute('aria-pressed')"),'true');
    await click('#selectedMapBranch .map-reading-footer a');
    await waitFor("location.pathname==='/pages/modules.html'&&document.activeElement.id==='mod-8-s4'");
    await click('#mod-8 .workshop-links > a');
    await waitFor("location.pathname==='/pages/mindmaps.html'&&mapSelections.get(activeMapKey)==='b-practice-institution'");
    console.log('PASS applied workshops, five maps, searchable concept relationships, branch deep links and precise lesson navigation');

    step='expanded educational glossary';
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await navigate('/pages/glossary.html');
    await evaluate(`Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.copiedTerm=value;}}});
      const item=GLOSSARY_DATA.find(term=>term.termFr.includes("d'établissement"));
      [...document.querySelectorAll('#glossaryGrid .card')].find(card=>card.textContent.includes(item.termFr)).querySelector('[data-term-copy]').click();`);
    await waitFor('typeof window.copiedTerm===\'string\'');assert((await evaluate('window.copiedTerm')).includes("d'établissement"));
    assert((await evaluate('window.copiedTerm')).includes('مثال توضيحي:'),'copy includes the educational example');
    assert.equal(await evaluate("document.querySelectorAll('#glossaryGrid .card').length"),100);
    assert.equal(await evaluate("document.querySelectorAll('.g-pill').length"),10,'all nine glossary domains are reachable');
    await fill('glossarySearchInput','etayage');
    assert.equal(await evaluate("document.querySelectorAll('#glossaryGrid .card').length"),1,'French search accepts missing accents');
    assert((await evaluate("document.getElementById('glossaryGrid').textContent")).includes('Étayage'));
    await fill('glossarySearchInput','EVALUATION DIAGNOSTIQUE');
    assert.equal(await evaluate("document.querySelectorAll('#glossaryGrid .card').length"),1);
    assert((await evaluate("document.getElementById('glossaryGrid').textContent")).includes('التقويم التشخيصي'));
    await click('#glossaryReset');
    await click('[data-category="تقويم ودعم"]');
    assert.equal(await evaluate("document.querySelectorAll('#glossaryGrid .card').length"),15);
    assert((await evaluate("document.getElementById('glossaryGrid').textContent")).includes('الدعم المؤسسي'));
    assert.equal(await evaluate("document.querySelector('[data-category=\"تقويم ودعم\"]').getAttribute('aria-pressed')"),'true');
    await click('#glossaryReset');
    await fill('glossarySearchInput','d’etablissement');
    assert.equal(await evaluate("document.querySelectorAll('#glossaryGrid .card').length"),1,'French apostrophe variants are searchable');
    await fill('glossarySearchInput','التَّعْزِيز السَّلْبِي');
    assert.equal(await evaluate("document.querySelectorAll('#glossaryGrid .card').length"),1,'Arabic search ignores diacritics');
    await click('.glossary-example summary');
    assert.equal(await evaluate("document.querySelector('.glossary-example').open"),true);
    assert((await evaluate("document.querySelector('.glossary-example p').textContent")).includes('حزام الأمان'));
    assert((await evaluate("document.querySelector('.glossary-card .card-footer a').href")).endsWith('modules.html#mod-3'));
    for(const width of [1440,375,320]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<=800});
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true,'glossary overflow at '+width);
    }
    await evaluate("document.querySelector('.glossary-card').scrollIntoView({behavior:'instant',block:'start'})");
    await screenshot('glossary-example-mobile');
    await fill('glossarySearchInput','zzznomatch');
    assert.equal(await evaluate("document.querySelectorAll('#glossaryGrid .card').length"),0);
    await click('.glossary-empty button');
    assert.equal(await evaluate("document.querySelectorAll('#glossaryGrid .card').length"),100,'reset restores the complete glossary');
    assert.equal(await evaluate('document.activeElement.id'),'glossarySearchInput');
    assert.equal(await evaluate("document.getElementById('glossaryCatPills').getClientRects().length"),0,'mobile uses a compact category selector');
    assert.equal(await evaluate("document.getElementById('glossaryCategorySelect').getClientRects().length>0"),true);
    await evaluate("(()=>{const select=document.getElementById('glossaryCategorySelect');select.value='تخطيط وتواصل';select.dispatchEvent(new Event('change',{bubbles:true}));})()");
    assert.equal(await evaluate("document.querySelectorAll('#glossaryGrid .card').length"),8);
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);
    await screenshot('glossary-planning-mobile');
    console.log('PASS 100 bilingual glossary terms, nine categories, accent/diacritic search, examples, lesson links, copy and reset at desktop/mobile widths');

    step='flashcard accessibility and daily review';await navigate('/pages/flashcards.html');
    let card=await evaluate("({front:document.getElementById('fcFrontText').textContent,back:document.getElementById('fcBackText').textContent})");
    await click('[data-click="nextCard"]');await click('[data-click="prevCard"]');
    assert.equal(await evaluate("document.getElementById('fcFrontText').textContent"),card.front,'Previous still returns to the preceding card');
    await evaluate("document.getElementById('flashcardNavigation').scrollIntoView({behavior:'instant',block:'center'})");
    await screenshot('flashcard-navigation-mobile');
    let tree=await send('Accessibility.getFullAXTree');assert(tree.nodes.some(n=>!n.ignored&&n.name?.value===card.front));assert(!tree.nodes.some(n=>!n.ignored&&n.name?.value===card.back));
    await click('.flashcard-wrapper');tree=await send('Accessibility.getFullAXTree');assert(!tree.nodes.some(n=>!n.ignored&&n.name?.value===card.front));assert(tree.nodes.some(n=>!n.ignored&&n.name?.value===card.back));
    const marked=await evaluate('activeCards[currentIndex].id');await click('[data-card-mark="known"]');
    await waitFor(`ProgressManager.getData().masteredFlashcards.includes(${JSON.stringify(marked)})&&!savingCard`);
    await navigate('/pages/flashcards.html?review=today','dueOnly');assert.equal(await evaluate(`activeCards.some(card=>card.id===${JSON.stringify(marked)})`),false);
    const remaining=await evaluate('activeCards.length');await click('[data-card-mark="known"]');await waitFor(`!savingCard&&activeCards.length===${remaining - 1}`);
    console.log('PASS hidden flashcard answers and daily review scheduling');

    step='blank new fiches and explicit templates';await navigate('/pages/fiche-generator.html','sheetReady');
    const emptyFiche="Object.entries(sheetFields()).every(([field,value])=>field==='language'||value==='')";
    assert.equal(await evaluate(emptyFiche),true,'a fresh account starts with empty inputs');
    for(const language of ['ar','fr']) {
      await evaluate(`document.getElementById('inLanguage').value='${language}';changeFicheLanguage()`);
      assert.equal(await evaluate(emptyFiche),true,'changing language leaves empty fields empty');
      await click('[data-click="loadPreset"][data-args*="science"]');
      await waitFor("sheetFields().title!==''");
      await fill('inSchool','School to clear');await fill('inTeacher','Teacher to clear');
      await click('#newDraftBtn');await waitFor('!draftSaving&&!draftDirty&&draftVersion===0');
      assert.equal(await evaluate(emptyFiche),true,'New fiche clears content, classroom metadata and selectors');
      assert.equal(await evaluate('ficheLanguage'),language,'New fiche preserves only the selected language');
      assert.equal(await evaluate("draftTimer===null&&!document.querySelector('[data-fiche-subject][aria-pressed=\"true\"]')&&document.getElementById('draftSelect').value===''"),true,'no template or queued autosave remains');
      assert.equal(await evaluate("accountRequest('/api/drafts').then(result=>result.drafts.some(item=>item.title))"),true,'the previous named fiche is saved');
      await navigate('/pages/fiche-generator.html','sheetReady');
      assert.equal(await evaluate(emptyFiche),true,'reload retains the new blank editor despite existing saved fiches');
      assert.equal(await evaluate('ficheLanguage'),language);
    }
    await fill('inTitle','My own lesson without a model');await click('#saveDraftBtn');await waitFor('draftVersion>0&&!draftDirty&&!draftSaving');
    await navigate('/pages/fiche-generator.html','sheetReady');
    assert.equal(await evaluate("Object.entries(sheetFields()).every(([field,value])=>field==='language'||field==='title'||value==='')"),true,'a custom title saves and reopens without inserting template content');
    await evaluate("document.getElementById('draftSelect').value='';document.getElementById('draftSelect').dispatchEvent(new Event('change',{bubbles:true}))");
    await waitFor('draftVersion===0&&!draftDirty');assert.equal(await evaluate(emptyFiche),true,'New fiche in the saved list also clears the editor');
    await evaluate("document.getElementById('inLanguage').value='ar';changeFicheLanguage()");
    console.log('PASS blank initial/new fiches, all inputs cleared in both languages, explicit templates, title-only drafts and blank reload recovery');

    step='lesson templates, safe preview and drafts';
    await click('[data-click="loadPreset"][data-args*="math"]');await waitFor("document.getElementById('outSubject').textContent.includes('الرياضيات')");
    assert.equal(await evaluate("document.querySelector('.sheet-steps-table').textContent.includes('سمكة')"),false);
    await fill('inCriteria','Verify by substitution');assert.equal(await evaluate("document.getElementById('outCriteria').textContent"),'Verify by substitution');
    await fill('inObjectives','<img src=x onerror="window.auditXss=true">\nSecond objective');
    assert.equal(await evaluate("document.getElementById('outObjectives').querySelector('img')"),null);assert.equal(await evaluate('window.auditXss===true'),false);
    await fill('inTitle','Leçon <img src=x onerror="window.auditXss=true">');
    assert.equal(await evaluate("document.getElementById('outLessonTitle').querySelector('img')"),null,'lesson heading renders literal text safely');
    assert.equal(await evaluate("document.getElementById('outLessonTitle').textContent===sheetFields().title"),true);
    await fill('inTitle','Saved browser lesson');await click('#saveDraftBtn');await waitFor('draftVersion>0&&!draftDirty&&!draftSaving');
    const draft=await evaluate('({id:draftId,version:draftVersion,fields:sheetFields()})');
    await navigate('/pages/fiche-generator.html','sheetReady');assert.equal(await evaluate("document.getElementById('inTitle').value"),'Saved browser lesson');
    assert.equal(await evaluate("document.getElementById('outObjectives').querySelector('img')"),null);
    await evaluate(`accountRequest('/api/drafts/save',{id:draftId,version:draftVersion,fields:{...sheetFields(),title:'Other tab edit'}})`);
    await fill('inTitle','My preserved edit');await click('#saveDraftBtn');await waitFor('draftConflict');
    await click('#copyDraftBtn');await waitFor('!draftConflict&&!draftDirty&&!draftSaving');assert.notEqual(await evaluate('draftId'),draft.id);
    const unchanged=await evaluate(`accountRequest('/api/drafts/detail?id=${draft.id}')`);assert.equal(unchanged.draft.title,'Other tab edit');
    await screenshot('lesson-plan-mobile');
    await click('[data-click="loadPreset"][data-args*="lang"]');await waitFor("document.getElementById('outSubject').textContent.includes('اللغة العربية')");
    assert.equal(await evaluate("document.querySelector('.sheet-steps-table').textContent.includes('سمكة')"),false);
    await click('#saveDraftBtn');await waitFor('!draftDirty&&!draftSaving');console.log('PASS subject templates, literal objectives, saved drafts and conflict recovery');
    step='bilingual fiche levels, metadata and readable layouts';
    for (const [cycle,count] of [['primary',6],['college',3],['lycee',3]]) {
      await evaluate(`document.getElementById('inCycle').value='${cycle}';document.getElementById('inCycle').dispatchEvent(new Event('change',{bubbles:true}))`);
      assert.equal(await evaluate("[...document.getElementById('inLevel').options].filter(option=>option.value).length"),count);
    }
    await evaluate("document.getElementById('inLevel').value='bac2';document.getElementById('inLevel').dispatchEvent(new Event('change',{bubbles:true}))");
    assert.equal(await evaluate("document.getElementById('inTrack').tagName"),'SELECT');
    assert.deepEqual(await evaluate("({value:document.getElementById('inTrack').options[0].value,label:document.getElementById('inTrack').options[0].text})"),{value:'all',label:'ALL'});
    assert.equal(await evaluate("FICHE_TRACKS.filter(item=>item.levels.includes('bac2')).every(item=>[...document.getElementById('inTrack').options].some(option=>option.value===item.id))"),true);
    await evaluate("document.getElementById('inTrack').value='bac2-physiques';document.getElementById('inTrack').dispatchEvent(new Event('change',{bubbles:true}))");
    await fill('inSchool','Lycée de test');await fill('inTeacher','Enseignant de test');await fill('inDuration','60 minutes');
    await fill('inStudent2','Recherche personnalisée des élèves');await fill('inPhaseDuration2','30');
    await fill('inTitle','Bilingual saved lesson');await fill('inObjectives','Objectif personnalisé');
    const preserved=await evaluate('({title:sheetFields().title,objectives:sheetFields().objectives})');
    for(const language of ['fr','ar']) {
      await evaluate(`document.getElementById('inLanguage').value='${language}';document.getElementById('inLanguage').dispatchEvent(new Event('change',{bubbles:true}))`);
      assert.equal(await evaluate("document.getElementById('ficheWorkspace').dir"),language==='fr'?'ltr':'rtl');
      assert.equal(await evaluate("getComputedStyle(document.getElementById('ficheWorkspace')).textAlign"),'start','text follows the selected language direction');
      assert.equal(await evaluate("document.getElementById('sheetPreview').lang"),language);
      assert.equal(await evaluate("document.getElementById('outLessonTitle').textContent===sheetFields().title"),true,'lesson name follows the selected fiche in both languages');
      assert.deepEqual(await evaluate('({title:sheetFields().title,objectives:sheetFields().objectives})'),preserved,'custom lesson text survives language changes');
      for(const width of [1440,768,375,320]) {
        await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<=800});await delay(100);
        assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true,`fiche ${language} overflow at ${width}px`);
      }
    }
    await evaluate("document.getElementById('inLanguage').value='fr';document.getElementById('inLanguage').dispatchEvent(new Event('change',{bubbles:true}))");
    await click('#saveDraftBtn');await waitFor('!draftDirty&&!draftSaving');
    await navigate('/pages/fiche-generator.html','sheetReady');
    assert.equal(await evaluate('ficheLanguage'),'fr');assert.equal(await evaluate("document.getElementById('inLevel').value"),'bac2');
    assert.equal(await evaluate("document.getElementById('outLevel').textContent"),'2e année baccalauréat · Sciences physiques');
    assert.equal(await evaluate("document.getElementById('outSchool').textContent"),'Lycée de test');
    assert.equal(await evaluate("document.querySelectorAll('.sheet-steps-table thead th').length"),5);
    assert.equal(await evaluate("document.querySelector('.sheet-steps-table tbody').rows[1].cells[3].textContent"),'Recherche personnalisée des élèves');
    assert.equal(await evaluate("document.querySelector('.sheet-steps-table tbody').rows[1].cells[1].textContent"),'30');
    assert.equal(await evaluate("document.getElementById('fichePhaseTotal').textContent"),'Durée totale des phases : 65 min');
    assert.equal(await evaluate("document.querySelector('[data-fiche-text=\"save\"]').textContent"),'Enregistrer');
    await screenshot('fiche-french-mobile');
    console.log('PASS 12 Moroccan levels, French/Arabic directions, custom text preservation, metadata persistence and four screen widths');

    step='expanded bilingual subject library and stream compatibility';
    assert.equal(await evaluate("document.querySelectorAll('[data-fiche-subject]').length"),16);
    for (const language of ['ar','fr']) {
      await evaluate(`document.getElementById('inLanguage').value='${language}';changeFicheLanguage()`);
      for (const subject of ['science','math','lang','physics','french','informatics','svt','english','amazigh','islamic','history','philosophy','economics','technology','art','sport']) {
        await evaluate(`loadPreset('${subject}',false)`);
        assert.equal(await evaluate("[...document.querySelectorAll('.sheet-steps-table tbody tr')].every(row=>row.cells.length===5&&row.cells[2].textContent.trim()&&row.cells[3].textContent.trim()&&row.cells[2].textContent!==row.cells[3].textContent)"),true,subject+'/'+language);
      }
    }
    await evaluate("loadPreset('informatics',false);document.getElementById('inTrack').value='tc-sciences-fr';document.getElementById('inLevel').value='bac1';document.getElementById('inLevel').dispatchEvent(new Event('change',{bubbles:true}))");
    assert.equal(await evaluate("document.getElementById('inTrack').value"),'all','incompatible stream resets on year change');
    await fill('inPhaseDuration1','2.5');await click('#saveDraftBtn');
    assert.equal(await evaluate("document.getElementById('draftStatus').textContent===ficheText().invalidPhaseDuration"),true);
    await fill('inPhaseDuration1','5');await click('#saveDraftBtn');await waitFor('!draftDirty&&!draftSaving');
    console.log('PASS 16 subjects in both languages, five phase columns, saved timings/student work, ALL and stream/year compatibility');

    step='legacy student activities and safe template recovery';
    await evaluate("loadPreset('informatics',false)");
    await evaluate("(()=>{const legacy=sheetFields();legacy.step1='Consigne personnalisée';legacy.phaseDuration1='10';for(const field of ['student1','student2','student3','student4','language','cycle','level'])delete legacy[field];fillSheet(legacy)})()");
    assert.equal(await evaluate('ficheLanguage'),'fr','legacy French template retains its language');
    assert.equal(await evaluate("sheetFields().cycle==='lycee'&&sheetFields().level==='tc'"),true,'legacy computing template retains its school context');
    assert.equal(await evaluate("[1,2,3,4].every(index=>sheetFields()['student'+index]===FICHE_PRESETS_FR.informatics['student'+index])"),true,'absent student fields recover from the exact template');
    await evaluate("fillSheet({...sheetFields(),student1:'Travail personnalisé conservé',student2:'',student3:'',student4:''})");
    assert.equal(await evaluate("document.getElementById('ficheStudentRecovery').hidden"),false);
    assert.equal(await evaluate("document.getElementById('inStudent2').value"),'','explicitly blank activities stay blank until requested');
    await click('#restoreFicheStudents');
    assert.equal(await evaluate("document.getElementById('inStudent1').value"),'Travail personnalisé conservé');
    assert.equal(await evaluate("document.getElementById('inStep1').value"),'Consigne personnalisée');
    assert.equal(await evaluate("document.getElementById('inPhaseDuration1').value"),'10');
    assert.equal(await evaluate("document.getElementById('inStudent2').value"),await evaluate('FICHE_PRESETS_FR.informatics.student2'));
    assert.equal(await evaluate("document.getElementById('ficheStudentRecovery').hidden"),true);
    await click('#saveDraftBtn');await waitFor('!draftDirty&&!draftSaving');
    console.log('PASS legacy student-field recovery, explicit blanks, custom entries and timings are preserved');

    step='fiche deletion, autosave cancellation and cleared editor recovery';
    await evaluate("loadPreset('informatics')");await fill('inTitle','Fiche à supprimer');
    await click('#saveDraftBtn');await waitFor('draftVersion>0&&!draftDirty&&!draftSaving');
    const removedDraft=await evaluate('({id:draftId,version:draftVersion})');
    const draftsBeforeDelete=await evaluate("accountRequest('/api/drafts').then(result=>result.drafts)");
    await evaluate('window.originalConfirm=window.confirm;window.confirm=()=>false');await click('#deleteDraftBtn');
    assert.equal(await evaluate('draftId'),removedDraft.id,'cancelling deletion leaves the selected fiche intact');
    await evaluate("window.confirm=()=>true;window.originalDraftRequest=accountRequest;accountRequest=async(endpoint,body)=>{if(endpoint==='/api/drafts/delete')throw new Error('Deletion temporarily unavailable');return window.originalDraftRequest(endpoint,body)}");
    await click('#deleteDraftBtn');await waitFor("document.getElementById('draftStatus').textContent==='Deletion temporarily unavailable'");
    assert.equal(await evaluate('draftId'),removedDraft.id,'failed deletion retains the fiche');
    assert.equal(await evaluate("!draftDeleting&&!document.getElementById('ficheWorkspace').inert&&!document.getElementById('saveDraftBtn').disabled&&!document.getElementById('deleteDraftBtn').disabled"),true,'failed deletion restores usable controls');
    await evaluate("accountRequest=async(endpoint,body)=>{if(endpoint==='/api/drafts/delete')await new Promise(resolve=>setTimeout(resolve,300));return window.originalDraftRequest(endpoint,body)}");
    await fill('inTitle','Pending edit to delete');await click('#deleteDraftBtn');await waitFor('draftDeleting');
    assert.equal(await evaluate("document.getElementById('ficheWorkspace').inert&&document.getElementById('saveDraftBtn').disabled&&document.getElementById('deleteDraftBtn').disabled"),true,'deletion blocks overlapping edits and saves');
    await waitFor('!draftDeleting&&draftVersion===0');
    await evaluate('accountRequest=window.originalDraftRequest;window.confirm=window.originalConfirm');
    assert.equal(await evaluate("!draftDirty&&!draftSaving&&draftTimer===null&&sheetFields().title===''&&document.getElementById('outLessonTitle').textContent===''&&document.getElementById('deleteDraftBtn').hidden&&document.getElementById('draftSelect').value===''"),true,'deletion leaves an empty editor without a queued replacement');
    assert.equal(await evaluate("document.getElementById('draftStatus').textContent===ficheText().deleted"),true,'deletion is confirmed clearly');
    await delay(1100);
    const draftsAfterDelete=await evaluate("accountRequest('/api/drafts').then(result=>result.drafts)");
    const draftSummaries=items=>items.map(({id,title})=>({id,title})).sort((a,b)=>a.id.localeCompare(b.id));
    assert.deepEqual(draftSummaries(draftsAfterDelete),draftSummaries(draftsBeforeDelete.filter(item=>item.id!==removedDraft.id)),'only the requested fiche is removed; autosave creates no respiration replacement');
    assert.equal(await evaluate(`fetch('/api/drafts/detail?id=${removedDraft.id}').then(response=>response.status)`),404);
    await navigate('/pages/fiche-generator.html','sheetReady');await delay(1100);
    assert.equal(await evaluate("sheetFields().title===''&&!draftDirty&&draftVersion===0"),true,'reload keeps the clean empty editor instead of recovering a deleted fiche');
    assert.deepEqual(draftSummaries(await evaluate("accountRequest('/api/drafts').then(result=>result.drafts)")),draftSummaries(draftsAfterDelete),'reload does not save a default fiche');
    await evaluate("(async()=>{for(const item of (await accountRequest('/api/drafts')).drafts)await accountRequest('/api/drafts/delete',{id:item.id,version:item.version});await refreshDraftList();await loadPreset('math')})()");
    await fill('inTitle','Only remaining fiche');await click('#saveDraftBtn');await waitFor('draftVersion>0&&!draftDirty&&!draftSaving');
    assert.equal(await evaluate("accountRequest('/api/drafts').then(result=>result.drafts.length)"),1);
    await evaluate('window.confirm=()=>true');await click('#deleteDraftBtn');await waitFor('!draftDeleting&&draftVersion===0');
    await navigate('/pages/fiche-generator.html','sheetReady');await delay(1100);
    assert.equal(await evaluate("accountRequest('/api/drafts').then(result=>result.drafts.length)"),0,'deleting the last fiche stays deleted after reload');
    assert.equal(await evaluate("sheetFields().title===''&&!draftDirty&&document.getElementById('draftSelect').options.length===1&&document.getElementById('deleteDraftBtn').hidden"),true);
    console.log('PASS cancelled/failed deletion, pending autosave, remaining fiches, empty accounts and reload recovery');

    step='quiz without voice controls';await navigate('/pages/quiz.html','activeQuestions.length>0&&!quizBusy');
    assert.equal(await evaluate("document.querySelector('[data-click=\"speakCurrentQuestion\"], [data-speech-player], audio')===null"),true);

    step='quiz resume, exam secrecy, results and history';
    await click('#modeToggleBtn');await waitFor("isExamMode&&quizAttempt.mode==='exam'&&!quizBusy");
    await click('#qOptions button');await waitFor('Object.keys(userAnswers).length===1&&!quizBusy');
    const attempt=await evaluate('({id:quizAttempt.id,deadline:timerDeadline,answers:userAnswers,questions:activeQuestions})');
    assert(!JSON.stringify(attempt.questions).includes('correctAnswer'));
    await navigate('/pages/quiz.html','activeQuestions.length>0&&!quizBusy');
    assert.equal(await evaluate('quizAttempt.id'),attempt.id);assert.equal(await evaluate('timerDeadline'),attempt.deadline);assert.equal(await evaluate('isExamMode'),true);
    assert.deepEqual(await evaluate('userAnswers'),attempt.answers);
    await evaluate("document.querySelector('#qOptions button:nth-child(2)').focus()");
    await click('#qOptions button:nth-child(2)');await waitFor('!quizBusy');
    assert.equal(await evaluate("document.activeElement.matches('#qOptions [aria-pressed=\"true\"]')"), true, 'saving an exam choice keeps keyboard focus on that choice');
    const revisedAnswers = await evaluate('userAnswers');
    await click('#quizQuestionMap summary');
    assert.equal(await evaluate("document.querySelectorAll('[data-quiz-jump]').length"), attempt.questions.length);
    await click('[data-quiz-jump="4"]');await waitFor('currentIndex===4');
    assert.equal(await evaluate('document.activeElement.id'), 'qTitle', 'question jumps move keyboard focus');
    await waitFor(panelAtTop('#quizContainer'), 'quiz question scrolls below the header');
    await click(`[data-quiz-jump="${attempt.questions.length-1}"]`);await click('#quizNextUnanswered');
    assert.equal(await evaluate('currentIndex'), 1, 'unanswered navigation wraps and skips saved answers');
    await click('#prevBtn');assert.equal(await evaluate('currentIndex'), 0);
    assert.deepEqual(await evaluate('userAnswers'), revisedAnswers, 'navigation keeps the revised saved answer');
    assert.equal(await evaluate("document.querySelector('[data-quiz-jump=\"0\"]').classList.contains('is-answered')"), true);
    await checkExpiryRetry('quiz');
    await evaluate('finishQuiz()');await waitFor('quizFinished&&!quizBusy');assert.equal(await evaluate("document.getElementById('quizFinalReport').hidden"),false);
    assert.equal(await evaluate('ProgressManager.getData().quizzesTaken'),1);assert((await evaluate('activeQuestions')).every(q=>q.correctAnswer!==undefined));
    const quizResult = await evaluate('quizAttempt.result');
    await checkReviewFilters('quizReviewControls', 'quizAnswerReview', {wrong:quizResult.answered-quizResult.score,unanswered:quizResult.total-quizResult.answered,correct:quizResult.score});
    await waitFor("document.querySelector('#quizHistory .history-row')!==null");await screenshot('quiz-results-mobile');
    console.log('PASS server quiz scoring, answer revision, resume, deadlines and result history');

    step='missing quiz and exam endpoints and recovery';
    for (const page of ['quiz', 'exams']) {
      const endpoint = page === 'quiz' ? '/api/quizzes/catalog' : '/api/exams';
      const errorId = page === 'quiz' ? 'quizRequestError' : 'examError';
      const messageId = page === 'quiz' ? 'quizRequestMessage' : 'examErrorMessage';
      const retryId = page === 'quiz' ? 'quizRequestRetry' : 'examRetry';
      const busy = page === 'quiz' ? 'quizBusy' : 'examBusy';
      const initializer = page === 'quiz' ? 'initializeQuiz' : 'initializeExams';
      const blocked = await send('Page.addScriptToEvaluateOnNewDocument', { source: `
        window.catalogOriginalFetch = window.fetch;
        window.fetch = (input, options) => input === ${JSON.stringify(endpoint)}
          ? Promise.resolve(new Response(JSON.stringify({error:'الطلب غير موجود.'}), {status:404, headers:{'Content-Type':'application/json'}}))
          : window.catalogOriginalFetch(input, options);` });
      await navigate(`/pages/${page}.html`, `!${busy}&&!document.getElementById('${errorId}').hidden`);
      assert((await evaluate(`document.getElementById('${messageId}').textContent`)).includes('غير متاحة حالياً'), 'learners receive an actionable service message');
      assert.equal(await evaluate("document.querySelector('[data-save-message]').textContent.includes('لم يُحفظ')"), false, 'loading failures do not claim an unsaved edit');
      if (page === 'quiz') {
        assert.equal(await evaluate("document.getElementById('quizPoolStatus').textContent.includes('جارٍ')||document.getElementById('questionCounter').textContent.includes('جارٍ')"), false, 'failed requests stop the loading placeholders');
        assert.equal(await evaluate("[...document.querySelectorAll('[data-quiz-config], [data-new-quiz]')].every(control=>control.disabled)"), true, 'quiz creation waits for the catalog');
      } else {
        assert.equal(await evaluate("document.getElementById('examLibraryStatus').textContent"), 'تعذر تحميل الامتحانات.');
      }
      await evaluate(`(async()=>{AccountManager.user.isAdmin=true;await ${initializer}();AccountManager.user.isAdmin=false;})()`);
      assert((await evaluate(`document.getElementById('${messageId}').textContent`)).includes('أعد تشغيل خادم المنصة'), 'administrators see the missing-update remedy');
      await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: blocked.identifier });
      await evaluate('window.fetch=window.catalogOriginalFetch;window.catalogRetryMarker=true');
      await click('#'+retryId);
      await waitFor(page === 'quiz' ? 'quizCatalogReady&&activeQuestions.length>0&&!quizBusy' : 'examLibrary.length===3&&!examBusy');
      assert.equal(await evaluate(`document.getElementById('${errorId}').hidden&&window.catalogRetryMarker`), true, 'retry recovers without a page reload');
    }
    console.log('PASS missing-endpoint messages, finished loading states, separate save errors and recovery without reload');

    step='expanded practice bank and original exam archive';
    await navigate('/pages/quiz.html?source=exam-2024','activeQuestions.length>0&&!quizBusy');
    assert.equal(await evaluate("document.getElementById('quizBankTotal').textContent"),'249');
    assert.equal(await evaluate("activeQuestions.every(question=>question.sourceExamId==='exam-2024')"),true,'practice source selector uses the chosen paper');
    assert.equal(await evaluate("document.querySelectorAll('#qOptions button').length"),5,'practice supports five choices');
    assert.equal(await evaluate("document.getElementById('qOptions').textContent.includes('undefined')"),false);
    await click('#qOptions button');await waitFor('!quizBusy');
    assert.equal(await evaluate("Boolean(document.querySelector('#qLearningReferences a[href*=\"-s\"]'))&&document.getElementById('qExpText').textContent.length>0"),true,'archive practice explanations link to a specific lesson');
    await navigate('/pages/exams.html','examLibrary.length===3&&!examBusy');
    await screenshot('exams-library-mobile');
    await click('[data-exam-start="exam-2023"]');
    await waitFor("examAttempt?.config.examId==='exam-2023'&&!examBusy");
    assert.equal(await evaluate("document.querySelectorAll('.exam-question').length"),60);
    assert.equal(await evaluate("document.querySelectorAll('.exam-question input').length"),240);
    assert.equal(await evaluate("document.getElementById('examCorrection').hidden&&document.querySelectorAll('.exam-correction-item').length===0"),true,'corrections are absent until submission');
    await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
    await click('input[data-exam-question="2023061"][value="2"]');
    await waitFor("!examBusy&&!document.getElementById('examError').hidden");
    assert.equal(await evaluate("document.getElementById('examSessionTools').contains(document.getElementById('examError'))"), true, 'save retries are shown in the exam toolbar');
    assert.equal(await evaluate("examAttempt.answers[2023061]===undefined&&!document.querySelector('input[data-exam-question=\"2023061\"][value=\"2\"]').checked"),true,'failed saves restore the last accepted answer');
    await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
    await click('#examRetry');await waitFor('!examBusy&&examAttempt.answers[2023061]===2');
    const archivedAttempt = await evaluate('({id:examAttempt.id,deadline:examAttempt.deadline})');
    await navigate('/pages/exams.html',"examAttempt?.id==='"+archivedAttempt.id+"'&&!examBusy");
    assert.equal(await evaluate('examAttempt.deadline'),archivedAttempt.deadline,'refresh preserves the two-hour deadline');
    assert.equal(await evaluate("document.querySelector('input[data-exam-question=\"2023061\"][value=\"2\"]').checked"),true,'refresh restores the saved choice');
    assert((await evaluate("document.querySelector('[data-exam-start=\"exam-2023\"]').textContent")).includes('استئناف'));
    await click('[data-exam-start="exam-2023"]');await waitFor('!examBusy');
    assert.equal(await evaluate('examAttempt.id'), archivedAttempt.id, 'the current exam card resumes instead of replacing the attempt');
    assert.equal(await evaluate('examAttempt.deadline'), archivedAttempt.deadline);
    step='pause paper, use other pages and resume without losing either activity';
    await click('[data-exam-jump="2023100"]');
    await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
    await click('#examTogglePause');await waitFor("!examBusy&&!document.getElementById('examError').hidden");
    assert.equal(await evaluate('examAttempt.status'),'active','a failed pause request does not claim that the clock stopped');
    await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
    await click('#examRetry');await waitFor("!examBusy&&examPaused()");
    const pausedPaper = await evaluate('({id:examAttempt.id,remaining:examAttempt.remainingMs,answers:examAttempt.answers,currentIndex:examAttempt.currentIndex})');
    const frozenTimer = await evaluate("document.getElementById('examTimer').textContent");
    assert.equal(pausedPaper.currentIndex,39,'pausing saves the question position');
    assert.equal(await evaluate("[...document.querySelectorAll('#examAnswers input')].every(input=>input.disabled)&&document.getElementById('examSubmit').disabled"),true);
    assert.equal(await evaluate("document.getElementById('examCorrection').hidden&&!document.getElementById('examPausedNotice').hidden"),true,'pausing keeps corrections hidden');
    for (const width of [1440,375,320]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<=800});await delay(100);
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true,'paused toolbar overflow at '+width);
    }
    await screenshot('exam-paused-mobile');
    clockOffset+=180000;
    await evaluate('updateExamTimer()');
    assert.equal(await evaluate("document.getElementById('examTimer').textContent"),frozenTimer,'paused browser timer stays frozen');
    await click('#examPausedQuizLink');await waitFor("location.pathname==='/pages/quiz.html'&&activeQuestions.length>0&&!quizBusy");
    assert.equal(await evaluate("document.getElementById('quizSavedExam').hidden"),false,'practice offers a route back to the saved paper');
    assert((await evaluate("document.getElementById('quizSavedExamLink').href")).includes(pausedPaper.id));
    await click('[data-new-quiz]');await waitFor('!quizBusy');
    await click('#qOptions button');await waitFor('!quizBusy');
    const practiceDuringPause = await evaluate('({id:quizAttempt.id,answers:userAnswers})');
    clockOffset+=180000;
    await navigate('/pages/modules.html');
    await navigate('/pages/exams.html',"examPaused()&&!examBusy");
    assert.equal(await evaluate('examAttempt.id'),pausedPaper.id);
    assert.equal(await evaluate('examAttempt.remainingMs'),pausedPaper.remaining,'other pages and refresh do not use up paused time');
    assert.deepEqual(await evaluate('examAttempt.answers'),pausedPaper.answers);
    await click('#examTogglePause');await waitFor("!examBusy&&examAttempt.status==='active'");
    assert.equal(await evaluate('examAttempt.id'),pausedPaper.id);
    assert.equal(await evaluate(`Math.abs(examAttempt.deadline-examAttempt.serverTime-${pausedPaper.remaining})<1000`),true,'resume restores only the saved remaining time');
    assert.equal(await evaluate("document.activeElement.closest('.exam-question').id"),'exam-q-2023100','resume returns to the saved question');
    await navigate('/pages/quiz.html','activeQuestions.length>0&&!quizBusy');
    assert.equal(await evaluate('quizAttempt.id'),practiceDuringPause.id,'resuming a paper preserves the practice attempt');
    assert.deepEqual(await evaluate('userAnswers'),practiceDuringPause.answers);
    await click('[data-new-quiz]');await waitFor('!quizBusy');
    assert.equal(await evaluate(`accountRequest('/api/quizzes/attempt?id=${pausedPaper.id}').then(result=>result.attempt.status)`),'paused','starting a new quiz pauses the paper instead of abandoning it');
    await navigate('/pages/exams.html',"examPaused()&&!examBusy");
    await click('[data-exam-start="exam-2023"]');await waitFor("!examBusy&&examAttempt.status==='active'");
    assert.equal(await evaluate('examAttempt.id'),pausedPaper.id);
    console.log('PASS pause failure/retry, frozen timer, saved answers and position, independent quiz, automatic pause on new quiz and explicit resume');
    step='responsive paper and correction';
    for(const width of [1440,768,375,320]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<=800});await delay(100);
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true,'exam paper overflow at '+width);
      await click('[data-exam-jump="2023100"]');
      await waitFor("Math.abs(document.getElementById('exam-q-2023100').getBoundingClientRect().top-document.querySelector('.site-topbar').getBoundingClientRect().bottom-document.getElementById('examSessionTools').getBoundingClientRect().height-28)<3", 'exam question stays below the toolbar at '+width);
      assert.equal(await evaluate("Math.abs(document.getElementById('examSessionTools').getBoundingClientRect().top-document.querySelector('.site-topbar').getBoundingClientRect().bottom)<2"), true, 'timer stays visible while reading the paper');
      assert.equal(await evaluate("document.activeElement.closest('.exam-question').id"), 'exam-q-2023100');
      await click('#examNextUnanswered');
      assert.equal(await evaluate("document.activeElement.closest('.exam-question').id"), 'exam-q-2023101');
    }
    assert.equal(await evaluate('Object.keys(examAttempt.answers).length'), 1, 'jumping around the paper preserves answers');
    await screenshot('exam-paper-mobile');
    await checkExpiryRetry('exams');
    await evaluate('submitArchivedExam()');await waitFor('!examBusy&&examAttempt.status===\'submitted\'');
    assert.equal(await evaluate('examAttempt.result.score'),1);assert.equal(await evaluate('examAttempt.result.total'),60);
    assert.equal(await evaluate("document.querySelectorAll('.exam-correction-item').length"),60);
    assert.equal(await evaluate("document.querySelectorAll('.exam-correction-links a[href^=\"modules.html#\"]').length"),60);
    await checkReviewFilters('examReviewControls', 'examCorrectionAnswers', {wrong:0,unanswered:59,correct:1});
    for(const [year,choice,total] of [[2024,0,41],[2025,1,46]]) {
      await click(`[data-exam-start="exam-${year}"]`);await waitFor(`examAttempt?.config.examId==='exam-${year}'&&!examBusy`);
      assert.equal(await evaluate("document.querySelectorAll('.exam-question input').length"),300);
      await click(`input[data-exam-question="${year}061"][value="${choice}"]`);await waitFor('!examBusy');
      await click(`input[data-exam-question="${year}062"][value="0"]`);await waitFor('!examBusy');
      if(year===2024) assert.equal(await evaluate("!!document.querySelector('#exam-q-2024118 svg')"),true,'the original visual question retains its diagram');
      await evaluate('submitArchivedExam()');await waitFor('!examBusy&&examAttempt.status===\'submitted\'');
      assert.equal(await evaluate('examAttempt.result.score'),1);
      assert.equal(await evaluate('examAttempt.result.total'),total,'unresolved choices do not affect the denominator');
      assert.equal(await evaluate("document.querySelectorAll('.exam-correction-item[data-result=\"review\"]').length"),60-total);
      await checkReviewFilters('examReviewControls', 'examCorrectionAnswers', {wrong:0,unanswered:total-1,correct:1,review:60-total});
    }
    try { await waitFor(panelAtTop('#examCorrection'),'exam correction scrolled into view'); }
    catch (error) {
      console.log('Exam scroll geometry:', await evaluate("({y:scrollY,top:document.getElementById('examCorrection').getBoundingClientRect().top,header:document.querySelector('.site-topbar').getBoundingClientRect().bottom,height:document.documentElement.scrollHeight})"));
      await screenshot('exam-correction-scroll-failure');throw error;
    }
    await screenshot('exam-correction-mobile');
    assert.equal(await evaluate("document.querySelectorAll('#examHistory .history-row').length"),3);
    console.log('PASS 249 practice questions, source filters, original 2023–2025 papers, save retries, resume, responsive layouts, end-only correction and ungraded review items');

    step='failed progress save retry';await navigate('/pages/modules.html');
    await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
    assert.equal(await evaluate("ProgressManager.setModuleCompleted('mod-1',true)"),false);
    assert.equal(await evaluate('unsavedLearningEvents.length'),1);
    assert.equal(await evaluate("document.querySelector('[data-retry-saves]').hidden"),false);
    await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
    await navigate('/pages/modules.html');await waitFor("unsavedLearningEvents.length===0&&ProgressManager.getData().completedModules.includes('mod-1')");
    console.log('PASS persistent retry of an interrupted progress save');

    step='account session controls';
    await navigate('/pages/settings.html',"document.getElementById('sendVerification').hidden&&document.querySelector('.session-row')!==null");
    const other=await f.request('/api/auth/login',{email:'browser@example.test',password:'Browser-learner-password'});assert.equal(other.status,200);
    await navigate('/pages/settings.html',"document.querySelectorAll('.session-row').length===2");await click('#revokeOtherSessions');
    await waitFor("document.querySelectorAll('.session-row').length===1");assert.equal((await f.request('/api/progress',undefined,other.cookie)).status,401);
    await fill('currentPassword','Browser-learner-password');await fill('newPassword','Browser-changed-password');await fill('confirmPassword','Browser-changed-password');
    await click('#changePasswordForm button');await waitFor("document.getElementById('newPassword').value===''");await screenshot('account-settings-mobile');
    await click('.logout-button');await waitFor("location.pathname==='/index.html'");
    await navigate('/pages/account.html');await click('#forgotPasswordLink');await fill('accountEmail','browser@example.test');await click('#accountSubmit');
    await waitFor("!document.getElementById('accountSuccess').hidden");await f.app.flushMail();
    const recovery=f.messages.find(message=>message.to==='browser@example.test'&&message.text.includes('mode=reset'));
    const resetToken=new URL(recovery.text.match(/https?:\/\/\S+/)[0]).hash;
    await navigate('/pages/account.html?mode=reset'+resetToken);await fill('accountPassword','Browser-recovered-password');await click('#accountSubmit');
    await waitFor("accountMode==='login'&&!document.getElementById('accountSuccess').hidden");
    await fill('accountEmail','browser@example.test');await fill('accountPassword','Browser-recovered-password');await click('#accountSubmit');
    await waitFor("location.pathname==='/pages/dashboard.html'&&document.documentElement.dataset.auth==='ready'");
    console.log('PASS email verification, password change/recovery and session revocation');
    step='admin dashboard, sidebar account controls and readable responsive layouts';
    const admin=await f.register('browser-admin@example.test');
    const unverified=await f.register('admin-pending@example.test',{verify:false});
    await send('Network.setCookie',{name:'edu_session',value:admin.cookie.slice(12),url:f.origin,httpOnly:true,sameSite:'Lax'});
    await navigate('/pages/admin.html',"document.getElementById('kpiTotalUsers').textContent!=='—'");
    assert.equal(await evaluate("document.getElementById('adminNameDisplay').textContent"),'Test learner');
    assert.equal(await evaluate("document.querySelectorAll('.sidebar-account').length"),1);
    assert.equal(await evaluate("document.querySelector('.sidebar-profile-copy small').textContent"),'مدير المنصة');
    for(const width of [1440,1024,800,375,320]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<=800});await delay(100);
      for(const tab of ['overview','users','mail','analytics']) {
        await evaluate(`switchAdminTab('${tab}')`);
        assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true,`admin ${tab} overflow at ${width}px`);
      }
      assert.equal(await evaluate("[...document.querySelectorAll('.admin-tab-btn,.kpi-title,.kpi-subtext,.admin-table td,.sidebar-account-action')].every(el=>parseFloat(getComputedStyle(el).fontSize)>=14)"),true,'readable admin text at '+width);
    }
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await evaluate("switchAdminTab('overview')");await screenshot('admin-overview-desktop');
    await click('#themeToggleBtn');await delay(350);await screenshot('admin-overview-dark');await click('#themeToggleBtn');await delay(350);
    await click('[data-followup="users"]');
    await waitFor("currentTab==='users'&&document.querySelector('#usersTableBody [data-admin-action=\"view-user\"]')");
    assert.equal(await evaluate("document.getElementById('userFilterSelect').value"),'unverified');
    assert((await evaluate("document.getElementById('usersTableBody').textContent")).includes('admin-pending@example.test'));
    await evaluate(`document.querySelector('#usersTableBody [data-admin-action="view-user"][data-user-id="${unverified.body.user.id}"]').focus()`);
    await click(`#usersTableBody [data-admin-action="view-user"][data-user-id="${unverified.body.user.id}"]`);
    await waitFor("!document.getElementById('userDetailModal').hidden&&document.querySelector('.user-detail-grid')");
    assert.equal(await evaluate("document.activeElement.id"),'btnCloseModal');
    assert.equal(await evaluate("document.querySelector('main').inert"),true);
    await evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
    assert.equal(await evaluate("document.getElementById('userDetailModal').hidden"),true);
    assert.equal(await evaluate("document.activeElement.dataset.adminAction"),'view-user');
    await click(`#usersTableBody [data-admin-action="toggle-verify"][data-user-id="${unverified.body.user.id}"]`);
    await waitFor("!document.getElementById('usersTableBody').textContent.includes('admin-pending@example.test')&&!document.querySelector('#usersTableBody').closest('.table-responsive').hasAttribute('aria-busy')");
    assert.equal((await f.request('/api/admin/users/detail?id='+unverified.body.user.id,undefined,admin.cookie)).body.user.email_verified,true);
    await click('#btnClearUserFilters');
    await waitFor("document.getElementById('userFilterSelect').value==='all'&&document.getElementById('usersTableBody').textContent.includes('admin-pending@example.test')");
    await fill('userSearchInput','does-not-exist');await waitFor("document.getElementById('usersTableBody').textContent.includes('لا توجد نتائج مطابقة')");
    await click('#btnClearUserFilters');await waitFor("document.getElementById('usersTableBody').textContent.includes('browser-admin@example.test')");
    await evaluate("document.querySelector('[data-admin-tab=\"overview\"]').focus();document.querySelector('.admin-tabs').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}))");
    assert.equal(await evaluate('currentTab'),'users');
    assert.equal(await evaluate("document.activeElement.getAttribute('aria-selected')"),'true');
    await evaluate("switchAdminTab('mail')");await click('#btnRetryMailTab');
    await waitFor("!document.getElementById('btnRetryMailTab').disabled");
    await evaluate("document.getElementById('mailFilterSelect').value='failed';document.getElementById('mailFilterSelect').dispatchEvent(new Event('change',{bubbles:true}))");
    await waitFor("document.getElementById('mailJobsTableBody').textContent.includes('لا توجد رسائل مطابقة')");
    await evaluate("switchAdminTab('overview')");
    await evaluate(`window.adminOriginalFetch=window.fetch;window.fetch=(url,options)=>String(url)==='/api/admin/overview'?Promise.resolve(new Response(JSON.stringify({error:'Test unavailable'}),{status:503,headers:{'Content-Type':'application/json'}})):window.adminOriginalFetch(url,options);document.querySelectorAll('.toast').forEach(el=>el.remove());`);
    await click('#btnRefreshData');await waitFor("!document.getElementById('btnRefreshData').disabled");
    assert.equal(await evaluate("document.getElementById('adminNotice').hidden"),false);
    assert.equal(await evaluate("[...document.querySelectorAll('.toast')].some(el=>el.textContent.includes('تم تحديث البيانات بنجاح'))"),false);
    await evaluate('window.fetch=window.adminOriginalFetch');await click('#btnRefreshData');
    await waitFor("!document.getElementById('btnRefreshData').disabled&&document.getElementById('adminNotice').hidden");
    await send('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:1,mobile:true});await delay(100);
    await screenshot('admin-overview-mobile');await click('.menu-trigger');await screenshot('admin-sidebar-mobile');
    assert.equal(await evaluate("parseFloat(getComputedStyle(document.querySelector('.logout-button')).fontSize)>=14"),true);
    assert.equal(await evaluate("document.querySelector('.logout-button').getBoundingClientRect().bottom<=innerHeight"),true,'admin sidebar logout remains visible');
    await click('.logout-button');await waitFor("location.pathname==='/index.html'");
    assert.equal((await f.request('/api/admin/overview',undefined,admin.cookie)).status,401);
    await navigate('/pages/account.html?next='+encodeURIComponent('/pages/admin.html#analytics'));
    await fill('accountEmail','browser-admin@example.test');await fill('accountPassword','Test-learner-password');await click('#accountSubmit');
    await waitFor("location.pathname==='/pages/admin.html'&&currentTab==='analytics'&&document.getElementById('kpiExamAttempts').textContent!=='—'");
    console.log('PASS admin tabs at five widths, readable sidebar, account actions, modal focus, filters, refresh errors and logout');
    step='pending login, expired-code recovery and confirmation in another device';
    const pendingUser=await f.register('pending-browser@example.test',{verify:false});
    await send('Network.setCookie',{name:'edu_session',value:pendingUser.cookie.slice(12),url:f.origin,httpOnly:true,sameSite:'Lax'});
    await navigate('/pages/account.html?mode=pending',"accountMode==='pending'");
    await click('#verificationOtherAccount');await waitFor("accountMode==='login'&&AccountManager.user===null");
    await fill('accountEmail','pending-browser@example.test');await fill('accountPassword','Test-learner-password');await click('#accountSubmit');
    await waitFor("accountMode==='pending'&&!document.getElementById('signupVerification').hidden");
    await navigate('/pages/account.html?mode=verify#token='+('f'.repeat(64)),"accountMode==='pending'&&!document.getElementById('accountError').hidden");
    assert.equal(await evaluate("document.getElementById('signupVerification').hidden"),false,'invalid links retain resend controls');
    await navigate('/pages/account.html?mode=pending&next='+encodeURIComponent('/pages/modules.html#mod-1'),"accountMode==='pending'");
    await f.app.flushMail();
    const pendingMail=f.messages.findLast(message=>message.to==='pending-browser@example.test');
    const externalProof=verificationCode(pendingMail);
    clockOffset += 600000;
    await fill('verificationCode',externalProof);await click('#verificationSubmit');
    await waitFor("!verificationSubmitting&&!document.getElementById('accountError').hidden");
    await click('#verificationCheck');await waitFor("!verificationChecking&&!document.getElementById('verificationResend').disabled");
    await click('#verificationResend');await waitFor('!verificationResending');await f.app.flushMail();
    const freshProof=verificationCode(f.messages.findLast(message=>message.to==='pending-browser@example.test'));
    const otherDevice=await f.request('/api/auth/login',{email:'pending-browser@example.test',password:'Test-learner-password'});
    assert.equal((await f.request('/api/auth/verify-email',{code:freshProof},otherDevice.cookie)).status,200);
    await waitFor("location.pathname==='/pages/modules.html'&&location.hash==='#mod-1'&&document.documentElement.dataset.auth==='ready'");
    console.log('PASS pending login, expired-code recovery, automatic confirmation detection and return destination');
    assert.deepEqual(errors,[],'Browser exceptions');assert.deepEqual(violations,[],'CSP violations');
    console.log('Browser checks passed. Screenshots: '+artifacts);
  } catch (error) { error.message = step+': '+error.message; throw error; }
  finally {
    // Let Chrome release its profile files before the fixture removes them on Windows.
    if (chrome && chrome.exitCode === null && chrome.signalCode === null) {
      const exited = once(chrome, 'exit');
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ id: -1, method: 'Browser.close' }));
      else chrome.kill();
      let timer;
      await Promise.race([exited, new Promise(resolve => { timer = setTimeout(resolve, 5000); })]);
      clearTimeout(timer);
      if (chrome.exitCode === null && chrome.signalCode === null) chrome.kill();
      await delay(1000);
    }
    if(socket)socket.close();
    for(const cleanup of cleanups.reverse())await cleanup();
  }
}
browserSmoke().catch(error=>{console.error(error);process.exitCode=1;});
