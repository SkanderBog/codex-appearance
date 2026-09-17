'use strict';
// Loaded only by the private ASAR. The installed app and user preferences are untouched.
const electron = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { evaluate } = require('./evaluate.cjs');
const { healthScript, layoutFailures } = require('./layout-health.cjs');
const { ROOT, STATE, SETTINGS, readSettings, cssFor, saveSettings } = require('./core.cjs');
fs.mkdirSync(STATE, { recursive: true, mode: 0o700 });
const logFile = path.join(STATE, 'codex-bridge.json');
const OriginalWindow = electron.BrowserWindow;
const windows = new Map();
const updates = new WeakMap();
function log(extra = {}) {
  fs.writeFileSync(
    logFile,
    JSON.stringify(
      {
        pid: process.pid,
        version: electron.app.getVersion(),
        mode: process.env.COMPANION_MODE,
        time: new Date().toISOString(),
        windows: [...windows]
          .filter(([w]) => !w.isDestroyed())
          .map(([w, state]) => ({ id: w.id, ...state })),
        ...extra,
      },
      null,
      2,
    ),
  );
}
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
  if (!window.__companionObserver) { window.__companionObserver = new MutationObserver(mark); window.__companionObserver.observe(document.body, {childList:true, subtree:true}); }
  return { root: document.documentElement.getAttribute('data-codex-window-type'),
    bodyBackground: getComputedStyle(document.body).backgroundColor,
    textColor: getComputedStyle(document.body).color,
    panels: document.querySelectorAll('[data-companion-panel]').length };
})()`;
function update(win) {
  const next = (updates.get(win) || Promise.resolve())
    .catch(() => {})
    .then(() => applyCurrent(win));
  updates.set(win, next);
  return next;
}
async function applyCurrent(win) {
  const state = windows.get(win);
  if (!state || win.isDestroyed() || win.webContents.isDestroyed()) return;
  const s = readSettings();
  try {
    if (!win.webContents.getURL().startsWith('app://')) return;
    const baseline = s.enabled ? await evaluate(win.webContents, healthScript) : null;
    const after = s.enabled
      ? `return ${installControls};`
      : `
      document.getElementById('companion-access')?.remove();
      document.documentElement.removeAttribute('data-companion-reveal');
      document.documentElement.removeAttribute('data-companion-route');
      window.__companionObserver?.disconnect(); delete window.__companionObserver;
      delete window.__companionTogglePanels;
      document.querySelectorAll('[data-companion-panel]').forEach(e => e.removeAttribute('data-companion-panel'));
      return { restored: true };`;
    const result = await evaluate(
      win.webContents,
      `(() => {
      let style=document.getElementById('companion-appearance-style');
      if (!style) { style=document.createElement('style'); style.id='companion-appearance-style'; document.head.append(style); }
      style.textContent=${JSON.stringify(cssFor(s, { codex: true }))};
      ${after}
    })()`,
    );
    if (s.enabled) {
      await new Promise((resolve) => setTimeout(resolve, 120));
      if (win.isDestroyed() || win.webContents.isDestroyed()) return;
      const health = await evaluate(win.webContents, healthScript);
      const failures = layoutFailures(baseline, health);
      state.health = failures.length ? 'restored-after-layout-failure' : 'checked';
      if (failures.length) {
        state.healthFailures = failures;
        saveSettings({ ...readSettings(), enabled: false });
        await applyCurrent(win);
        return;
      }
      delete state.healthFailures;
      state.render = result;
      state.originalSetBackground('#00000000');
    } else {
      state.originalSetBackground(state.originalBackground);
    }
    state.applied = s.enabled;
    log();
  } catch (e) {
    state.error = e.message;
    if (s.enabled) {
      // A partial apply must not strand an unusable style or transparent surface.
      try {
        await evaluate(
          win.webContents,
          `document.getElementById('companion-appearance-style')?.remove()`,
        );
        state.originalSetBackground(state.originalBackground);
      } catch {}
      state.applied = false;
    }
    log();
  }
}
class StyledWindow extends OriginalWindow {
  constructor(options = {}) {
    const eligible = options.webPreferences?.webviewTag === true;
    const styled = eligible
      ? {
          ...options,
          transparent: true,
          backgroundColor: '#00000000',
          frame: false,
          titleBarStyle: 'hidden',
          hasShadow: false,
        }
      : options;
    super(styled);
    if (!eligible) return;
    const originalSetBackground = this.setBackgroundColor.bind(this);
    const state = {
      transparent: true,
      css: null,
      originalSetBackground,
      originalBackground: options.backgroundColor || '#181818',
    };
    windows.set(this, state);
    this.setBackgroundColor = (color) => {
      state.originalBackground = color;
      originalSetBackground(readSettings().enabled ? '#00000000' : color);
    };
    this.webContents.on('did-finish-load', () => {
      update(this);
      setTimeout(() => update(this), 2500);
      if (process.env.COMPANION_CHECK === '1')
        setTimeout(async () => {
          if (this.isDestroyed()) return;
          try {
            const { integrationCheck } = require('./integration-check.cjs');
            state.integration = await integrationCheck(this, () => update(this));
            log();
            if (process.env.COMPANION_CHECK_EXIT === '1')
              electron.app.exit(state.integration.passed ? 0 : 1);
          } catch (e) {
            state.captureError = e.message;
            log();
          }
        }, 7000);
    });
    this.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' || !input.control) return;
      if (
        readSettings().enabled &&
        readSettings().terminalMode &&
        ((!input.alt && input.key.toLowerCase() === 'b') ||
          (input.alt && input.key.toLowerCase() === 'f'))
      ) {
        event.preventDefault();
        evaluate(this.webContents, `window.__companionTogglePanels?.()`).catch(() => {});
      }
      if (input.alt && input.key.toLowerCase() === 'r') {
        event.preventDefault();
        saveSettings({ ...readSettings(), enabled: false });
      }
    });
    this.on('closed', () => {
      windows.delete(this);
      log();
    });
    log();
  }
}
try {
  module.exports = { StyledWindow };
  fs.watchFile(SETTINGS, { interval: 250, persistent: false }, () => {
    for (const win of windows.keys()) update(win);
  });
  electron.app.on('before-quit', () => fs.unwatchFile(SETTINGS));
  log({ installed: true });
} catch (e) {
  log({ installed: false, error: e.message });
}
