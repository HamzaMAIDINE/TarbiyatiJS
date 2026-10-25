/* Delegated controls use an explicit action allowlist; no executable HTML attributes. */
const UI_ACTIONS = new Set(["applyFilters", "clearMindmapSearch", "clearModuleFilters", "clearQuizFilters", "closeMobileMenu", "closeQuickSearch", "collapseAllBranches", "collapseAllModules", "collapseAllResCards", "copyTerm", "expandAllBranches", "expandAllModules", "expandAllResCards", "filterFCCat", "filterGlossaryCat", "filterMapDetails", "filterModules", "filterResources", "finishQuiz", "flipCurrentCard", "loadPreset", "markCard", "markDone", "nextCard", "nextQuestion", "nextScenario", "openQuickSearch", "performGlobalSearch", "prevCard", "prevQuestion", "print", "printAcademicDocument", "printAllModules", "printMindmap", "printModule", "renderGlossary", "resetFlashcards", "restartQuiz", "selectMindmapBranch", "setAccountMode", "setMindmapLayout", "shuffleCards", "shuffleScenarios", "switchMap", "toggleAccordion", "toggleExamMode", "toggleMobileMenu", "toggleTheme", "updateSheet"]);
for (const type of ['click', 'input', 'change']) {
  document.addEventListener(type, async event => {
    const control = event.target.closest?.('[data-' + type + ']');
    if (!control || control.disabled) return;
    const name = control.dataset[type];
    if (!UI_ACTIONS.has(name)) return;
    const action = name === 'print' ? () => window.print() : window[name];
    if (typeof action !== 'function') return;
    try {
      const args = JSON.parse(control.dataset.args || '[]').map(arg => arg === '$self' ? control : arg === '$value' ? control.value : arg);
      await action(...args);
    } catch (error) {
      if (typeof showToast === 'function') showToast(error.message || 'تعذر إتمام العملية.');
    }
  });
}
