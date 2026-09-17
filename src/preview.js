'use strict';
function update(s) {
  document.body.classList.toggle('full', !s.terminalMode);
  document.getElementById('alpha').textContent =
    `${Math.round((s.enabled ? s.opacity : 1) * 100)}%`;
}
window.companion.read().then((r) => update(r.settings));
window.companion.onSettings(update);
document.getElementById('reveal').onclick = () => document.body.classList.toggle('reveal');
document.getElementById('screen').onclick = () => {
  const home = document.documentElement.dataset.previewRoute !== 'home';
  document.documentElement.dataset.previewRoute = home ? 'home' : 'task';
  document.getElementById('screen').textContent = home ? 'Home' : 'Conversation';
};
document.getElementById('close').onclick = () => window.companion.close();
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.companion.close();
});
