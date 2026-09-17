'use strict';
const installControls = `(() => {
  window.__companionTogglePanels = () => {
    const reveal = document.documentElement.toggleAttribute('data-companion-reveal');
    const side = document.querySelector('.app-shell-left-panel');
    if (reveal && (!side || side.getBoundingClientRect().width === 0)) document.querySelector('button[class*="group/sidebar-trigger"]')?.click();
  };
  const mark = () => {
    const route = document.querySelector('[data-testid="home-icon"]') ? 'home' : 'task';
    if (document.documentElement.dataset.companionRoute !== route) document.documentElement.dataset.companionRoute = route;
    document.querySelectorAll('.app-shell-left-panel').forEach(e => e.setAttribute('data-companion-panel', 'sidebar'));
    // The native menu bar reserves space for window controls. Participate in its
    // flex layout so the button cannot float over controls or conversation text.
    const header = document.querySelector('[class*="_ApplicationMenuTopBar_"]');
    if (!header) return;
    let bar = document.getElementById('companion-access');
    if (!bar) {
      bar = document.createElement('div'); bar.id = 'companion-access';
      const panels = document.createElement('button'); panels.type = 'button';
      panels.textContent = 'Panels'; panels.title = 'Toggle sidebar (Ctrl+B or Ctrl+Alt+F)';
      panels.onclick = () => window.__companionTogglePanels();
      bar.append(panels);
    }
    if (bar.parentElement !== header) header.append(bar);
  };
  mark();
  if (!window.__companionObserver) {
    const relevant = '.app-shell-left-panel, [class*="_ApplicationMenuTopBar_"], [data-testid="home-icon"], #companion-access';
    const touchesControls = node => node.nodeType === 1 && (node.matches(relevant) || node.querySelector(relevant));
    window.__companionObserver = new MutationObserver(records => {
      // Text and message updates cannot change the navigation controls. Inspect
      // changed subtrees only, and combine structural changes into one frame.
      if (window.__companionMarkFrame || !records.some(record =>
        [...record.addedNodes, ...record.removedNodes].some(touchesControls))) return;
      window.__companionMarkFrame = requestAnimationFrame(() => {
        delete window.__companionMarkFrame;
        mark();
      });
    });
    window.__companionObserver.observe(document.body, {childList:true, subtree:true});
  }
  return { root: document.documentElement.getAttribute('data-codex-window-type'),
    bodyBackground: getComputedStyle(document.body).backgroundColor,
    textColor: getComputedStyle(document.body).color,
    panels: document.querySelectorAll('[data-companion-panel]').length };
})()`;
const removeControls = `
  window.__companionObserver?.disconnect(); delete window.__companionObserver;
  cancelAnimationFrame(window.__companionMarkFrame); delete window.__companionMarkFrame;
  document.getElementById('companion-access')?.remove();
  document.documentElement.removeAttribute('data-companion-reveal');
  document.documentElement.removeAttribute('data-companion-route');
  delete window.__companionTogglePanels;
  document.querySelectorAll('[data-companion-panel]').forEach(e => e.removeAttribute('data-companion-panel'));
`;
module.exports = { installControls, removeControls };
