const HOME_MODULE_TITLES = CURRICULUM_DATA.map(module => module.title.replace(/^المجزوءة\s+\d+:\s*/, ''));

function updateLearningHome() {
  const data = ProgressManager.getData();
  const welcome = document.getElementById('homeWelcome');
  if (welcome && AccountManager.user) welcome.textContent = `أهلاً بك، ${AccountManager.user.name}`;
  document.getElementById('homeQuizAttempts').textContent = data.quizzesTaken;
  document.getElementById('homeQuizBest').textContent = data.quizzesTaken ? `أفضل نتيجة: ${data.quizScore}%` : 'ابدأ أول اختبار';
  document.getElementById('homeSimulatorProgress').textContent = `${data.simulatorCompleted.length} / ${AccountManager.totals.simulator || 0}`;
  document.getElementById('homeFlashcardProgress').textContent = `${data.masteredFlashcards.length} / ${AccountManager.totals.flashcards || 0}`;
  document.getElementById('homeMindmapProgress').textContent = `${data.mindmapsViewed.length} / ${AccountManager.totals.mindmaps || 0}`;
  const completed = CURRICULUM_DATA.filter(module => data.completedModules.includes(module.id));
  const next = CURRICULUM_DATA.find(module => module.id === data.lastModuleId && !data.completedModules.includes(module.id)) || CURRICULUM_DATA.find(module => !data.completedModules.includes(module.id));
  const percent = Math.round(completed.length / CURRICULUM_DATA.length * 100);
  const ring = document.getElementById('learningProgress');
  ring.style.setProperty('--progress', `${percent}%`);
  ring.setAttribute('aria-valuenow', percent);
  document.getElementById('progressPercent').textContent = `${percent}%`;
  document.getElementById('progressCaption').textContent = `${completed.length} من ${CURRICULUM_DATA.length} مجزوءات مكتملة`;
  const continueLink = document.getElementById('continueLearning');
  continueLink.href = next ? `modules.html#${next.id}` : 'quiz.html';
  continueLink.textContent = completed.length === 0 ? 'ابدأ أول مجزوءة ←' : next ? 'تابع التعلم ←' : 'اختبر ما تعلمته ←';
  const startLink = document.getElementById('startLearning');
  startLink.href = next ? `modules.html#${next.id}` : 'modules.html';
  document.getElementById('homeCourses').innerHTML = CURRICULUM_DATA.slice(0, 3).map((module, index) => `
    <a href="modules.html#${module.id}" class="course-row">
      <span class="course-number" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
      <div class="course-details">
        <h3>${HOME_MODULE_TITLES[index]}</h3>
        <p>${module.badge} · ${module.sections.length} محاور${data.completedModules.includes(module.id) ? ' · مكتملة ✓' : ''}</p>
      </div>
      <svg class="course-chevron" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m14 7-5 5 5 5"/></svg>
    </a>
  `).join('');
}

document.addEventListener('DOMContentLoaded', updateLearningHome);
window.addEventListener('learning-progress', updateLearningHome);
window.addEventListener('pageshow', updateLearningHome);
