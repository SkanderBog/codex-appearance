'use strict';
// Loaded only by the private ASAR. The installed app and user preferences are untouched.
const electron = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { evaluate } = require('./evaluate.cjs');
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
  const mark = () => {
    document.querySelectorAll('.app-shell-left-panel').forEach(e => e.setAttribute('data-companion-panel', 'sidebar'));
  };
  mark();
  if (!window.__companionObserver) { window.__companionObserver = new MutationObserver(mark); window.__companionObserver.observe(document.body, {childList:true, subtree:true}); }
  window.__companionTogglePanels = () => {
    const reveal = document.documentElement.toggleAttribute('data-companion-reveal');
    const side = document.querySelector('.app-shell-left-panel');
    if (reveal && (!side || side.getBoundingClientRect().width === 0)) document.querySelector('button[class*="group/sidebar-trigger"]')?.click();
  };
  if (!document.getElementById('companion-access')) {
    const bar = document.createElement('div'); bar.id = 'companion-access';
    const panels = document.createElement('button'); panels.textContent = 'Panels'; panels.title = 'Reveal sidebar (Ctrl+B or Ctrl+Alt+F)';
    panels.onclick = () => window.__companionTogglePanels();
    bar.append(panels); document.body.append(bar);
  }
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
    const after = s.enabled
      ? `return ${installControls};`
      : `
      document.getElementById('companion-access')?.remove();
      document.documentElement.removeAttribute('data-companion-reveal');
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
      state.render = result;
      state.originalSetBackground('#00000000');
    } else {
      state.originalSetBackground(state.originalBackground);
    }
    state.applied = s.enabled;
    log();
  } catch (e) {
    state.error = e.message;
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
