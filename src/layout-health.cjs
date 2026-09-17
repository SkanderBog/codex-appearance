'use strict';

// Collect geometry only: no text, account identifiers, or conversation contents.
function measureLayout() {
  const visible = (element) => {
    if (!element) return false;
    const box = element.getBoundingClientRect(),
      style = getComputedStyle(element);
    return (
      box.width > 0 && box.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
    );
  };
  const input = [
    ...document.querySelectorAll(
      '[data-codex-composer-root] [contenteditable="true"], [data-codex-composer-root] textarea',
    ),
  ].find(visible);
  const box = input?.getBoundingClientRect();
  const hit = box && document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
  const thread = document.querySelector('.thread-scroll-container');
  const scrollable =
    !thread ||
    (visible(thread) &&
      (thread.scrollHeight <= thread.clientHeight + 1 ||
        ['auto', 'scroll'].includes(getComputedStyle(thread).overflowY)));
  return {
    route: document.querySelector('[data-testid="home-icon"]') ? 'home' : 'task',
    inputVisible: !!input,
    inputReachable: !!input && (hit === input || input.contains(hit)),
    scrollable,
    overflow: Math.max(
      0,
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  };
}
const healthScript = `(${measureLayout.toString()})()`;
function layoutFailures(before, after) {
  // Native navigation can replace these surfaces during an apply. Comparing two
  // different screens would incorrectly blame the appearance layer.
  if (before.route !== after.route) return [];
  const failures = [];
  if (before.inputVisible && !after.inputVisible) failures.push('input-hidden');
  if (before.inputReachable && !after.inputReachable) failures.push('input-obstructed');
  if (before.scrollable && !after.scrollable) failures.push('scroll-blocked');
  if (after.overflow > Math.max(1, before.overflow) + 1) failures.push('horizontal-overflow');
  return failures;
}
module.exports = { healthScript, layoutFailures };
