let scenarioOrder = QuizSession.shuffle(SIMULATOR_DATA.map((_, index) => index));
    let currentScenarioIdx = scenarioOrder[0];
    let earnedPoints = 0;
    const scenarioChoices = new Map();

    function initSimulator() {
      renderTabs();
      loadScenario(currentScenarioIdx);
      updateSimulatorProgress();
    }

    function updateSimulatorProgress() {
      const data = ProgressManager.getData();
      document.getElementById('simCompletedCount').textContent = `أكملت ${data.simulatorCompleted.length} من ${SIMULATOR_DATA.length} وضعيات`;
      SIMULATOR_DATA.forEach((scenario, index) => {
        const tab = document.getElementById(`simTab_${index}`);
        if (tab) tab.textContent = `الوضعية ${index + 1}${data.simulatorCompleted.includes(scenario.id) ? ' ✓' : ''}`;
      });
    }
    window.addEventListener('learning-progress', updateSimulatorProgress);

    function renderTabs() {
      const container = document.getElementById('simTabsContainer');
      container.innerHTML = '';
      scenarioOrder.forEach(i => {
        const btn = document.createElement('button');
        btn.className = `btn btn-sm ${i === currentScenarioIdx ? 'btn-primary' : 'btn-outline'}`;
        btn.textContent = `الوضعية ${i+1}`;
        btn.onclick = () => loadScenario(i);
        btn.id = `simTab_${i}`;
        container.appendChild(btn);
      });
    }

    function loadScenario(idx) {
      currentScenarioIdx = idx;
      const sc = SIMULATOR_DATA[idx];
      if (!sc) return;

      // Update tabs UI
      SIMULATOR_DATA.forEach((_, i) => {
        const t = document.getElementById(`simTab_${i}`);
        if (t) t.className = `btn btn-sm ${i === idx ? 'btn-primary' : 'btn-outline'}`;
      });

      document.getElementById('scenarioTitle').textContent = sc.title;
      document.getElementById('scenarioTheme').textContent = sc.theme;
      document.getElementById('scenarioDiff').textContent = `صعوبة: ${sc.difficulty}`;
      document.getElementById('scenarioText').innerHTML = sc.scenario;
      document.getElementById('scenarioQuestionText').textContent = sc.question;

      // Reset feedback
      const fb = document.getElementById('simFeedback');
      fb.classList.remove('show');

      // Render choices
      const choicesBox = document.getElementById('scenarioChoices');
      choicesBox.innerHTML = '';

      if (!scenarioChoices.has(sc.id)) scenarioChoices.set(sc.id, QuizSession.shuffle(sc.options));
      scenarioChoices.get(sc.id).forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'sim-choice-btn';
        btn.textContent = opt.text;
        btn.onclick = () => selectChoice(opt, sc, btn);
        choicesBox.appendChild(btn);
      });
    }

    async function selectChoice(opt, sc, btnEl) {
      // Disable all choices
      document.querySelectorAll('.sim-choice-btn').forEach(b => {
        b.disabled = true;
        b.style.opacity = '0.7';
      });

      btnEl.style.opacity = '1';
      btnEl.style.borderColor = opt.score >= 8 ? 'var(--success)' : 'var(--danger)';
      btnEl.style.background = opt.score >= 8 ? '#ecfdf5' : '#fee2e2';

      // Feedback
      const fb = document.getElementById('simFeedback');
      fb.classList.add('show');

      document.getElementById('fbTitle').textContent = opt.score >= 8 ? `✅ تشخيص دقيق: ${opt.effectName}` : `⚠️ انتبه: ${opt.effectName}`;
      document.getElementById('fbTitle').style.color = opt.score >= 8 ? 'var(--success)' : 'var(--danger)';
      document.getElementById('fbScoreBadge').textContent = `+${opt.score} نقاط`;
      document.getElementById('fbScoreBadge').style.background = opt.score >= 8 ? '#dcfce7' : '#fee2e2';
      document.getElementById('fbScoreBadge').style.color = opt.score >= 8 ? '#14532d' : '#991b1b';

      document.getElementById('fbText').innerHTML = `<strong>التحليل:</strong> ${opt.feedback}`;
      document.getElementById('fbActionText').textContent = sc.pedagogicalAction;
      document.getElementById('fbRef').textContent = `المصدر: ${sc.reference}`;

      earnedPoints += opt.score;
      document.getElementById('simOverallScoreBadge').textContent = `نقاط هذه الجلسة: ${earnedPoints}`;

      if (await ProgressManager.recordSimulatorScenario(sc.id)) showToast(`تم حفظ الوضعية في حسابك (+${opt.score} نقاط)`);
    }

    function nextScenario() {
      const position = scenarioOrder.indexOf(currentScenarioIdx);
      if (position < scenarioOrder.length - 1) {
        loadScenario(scenarioOrder[position + 1]);
      } else {
        showToast('وصلت إلى نهاية المسار. يمكنك بدء مسار عشوائي جديد.');
        shuffleScenarios();
      }
    }

    function shuffleScenarios() {
      const previous = scenarioOrder.join(',');
      scenarioOrder = QuizSession.shuffle(SIMULATOR_DATA.map((_, index) => index));
      if (scenarioOrder.length > 1 && scenarioOrder.join(',') === previous) scenarioOrder.push(scenarioOrder.shift());
      scenarioChoices.clear();
      earnedPoints = 0;
      document.getElementById('simOverallScoreBadge').textContent = 'نقاط هذه الجلسة: 0';
      currentScenarioIdx = scenarioOrder[0];
      renderTabs();
      updateSimulatorProgress();
      loadScenario(currentScenarioIdx);
    }

    document.addEventListener('DOMContentLoaded', () => {
      initSimulator();
    });
