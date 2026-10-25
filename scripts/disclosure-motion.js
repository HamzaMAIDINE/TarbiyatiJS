/* Shared motion for lesson panels and native mind map disclosures. */
const DisclosureMotion = (() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const active = new Map();
  const easing = 'cubic-bezier(0.22, 1, 0.36, 1)';
  let scrollRequest = 0;

  async function scrollToStart(element, isExpanded = () => true, { offset = 0 } = {}) {
    const request = ++scrollRequest;
    // A closing panel above the target can move it by several screenfuls.
    // Wait for the layout to settle before choosing the scroll destination.
    await Promise.allSettled([...active.values()].map(state => state.animation.finished));
    await new Promise(resolve => requestAnimationFrame(resolve));
    if (request !== scrollRequest || !element.isConnected || !element.getClientRects().length || !isExpanded()) return;
    const headerBottom = document.querySelector('.site-topbar')?.getBoundingClientRect().bottom || 0;
    const extraOffset = typeof offset === 'function' ? offset() : offset;
    const top = window.scrollY + element.getBoundingClientRect().top - headerBottom - extraOffset - 16;
    window.scrollTo({ top: Math.max(0, top), behavior: reducedMotion.matches ? 'instant' : 'smooth' });
  }

  function setExpanded(panel, expanded, { animate = true, onFinish } = {}) {
    const previous = active.get(panel);
    if (previous?.expanded === expanded) {
      if (!animate) previous.finish();
      return;
    }
    const visible = !panel.hidden;
    // Read the current frame before cancelling, so a quick second click reverses smoothly.
    const height = visible ? panel.getBoundingClientRect().height : 0;
    const opacity = visible ? getComputedStyle(panel).opacity : 0;
    previous?.animation.cancel();
    active.delete(panel);

    let animation;
    const finish = () => {
      panel.hidden = !expanded;
      panel.inert = !expanded;
      panel.classList.remove('is-animating');
      active.delete(panel);
      animation?.cancel();
      onFinish?.();
    };
    if (!animate || reducedMotion.matches || !panel.animate || !panel.isConnected ||
        (!previous && visible === expanded)) {
      finish();
      return;
    }

    panel.hidden = false;
    panel.inert = !expanded;
    panel.classList.add('is-animating');
    animation = panel.animate([
      { height: `${height}px`, opacity },
      { height: `${expanded ? panel.scrollHeight : 0}px`, opacity: expanded ? 1 : 0 }
    ], { duration: expanded ? 380 : 300, easing, fill: 'both' });
    active.set(panel, { expanded, animation, finish });
    animation.onfinish = finish;
  }

  function isDetailsOpen(detail) {
    const expanded = detail.querySelector(':scope > summary')?.getAttribute('aria-expanded');
    return expanded === null || expanded === undefined ? detail.open : expanded === 'true';
  }

  function setDetailsOpen(detail, expanded, { scroll = false, ...options } = {}) {
    const summary = detail.querySelector(':scope > summary');
    const panel = detail.querySelector(':scope > .disclosure-panel');
    if (!panel) { detail.open = expanded; return; }
    if (!expanded && panel.contains(document.activeElement)) summary.focus({ preventScroll: true });
    summary.setAttribute('aria-expanded', String(expanded));
    detail.classList.toggle('is-expanded', expanded);
    // Keep native details open until its closing animation has finished.
    if (expanded) detail.open = true;
    setExpanded(panel, expanded, { ...options, onFinish: () => { detail.open = expanded; } });
    if (expanded && scroll) scrollToStart(detail, () => isDetailsOpen(detail));
  }

  function enhanceDetails(root, { onToggle } = {}) {
    root.querySelectorAll('details[data-state-key]').forEach(detail => {
      if (detail.querySelector(':scope > .disclosure-panel')) return;
      const summary = detail.querySelector(':scope > summary');
      const panel = document.createElement('div');
      panel.className = 'disclosure-panel';
      [...detail.childNodes].forEach(node => { if (node !== summary) panel.appendChild(node); });
      detail.appendChild(panel);
      setDetailsOpen(detail, detail.open, { animate: false });
      summary.addEventListener('click', event => {
        if (event.defaultPrevented || event.target.closest('a, button, input, select, textarea')) return;
        event.preventDefault();
        const expanded = !isDetailsOpen(detail);
        if (onToggle) onToggle(detail, expanded);
        else setDetailsOpen(detail, expanded, { scroll: true });
      });
    });
  }

  function finishAll() {
    for (const state of [...active.values()]) state.finish();
  }
  reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) finishAll(); });
  window.addEventListener('beforeprint', finishAll);
  return { setExpanded, enhanceDetails, setDetailsOpen, isDetailsOpen, scrollToStart };
})();
