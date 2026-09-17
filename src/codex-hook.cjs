'use strict';
// Loaded by the private Linux ASAR or owned native startup. Installed files stay untouched.
const electron = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { evaluate } = require('./evaluate.cjs');
const { installControls, removeControls } = require('./controls.cjs');
const { coalesceUpdates, watchSettings } = require('./updates.cjs');
const { healthScript, layoutFailures } = require('./layout-health.cjs');
const { ROOT, STATE, SETTINGS, readSettings, cssFor, saveSettings } = require('./core.cjs');
fs.mkdirSync(STATE, { recursive: true, mode: 0o700 });
const logFile = path.join(STATE, 'codex-bridge.json');
const OriginalWindow = electron.BrowserWindow;
const windows = new Map();
const updates = new WeakMap();
const appliedCSS = new WeakMap();
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

function update(win) {
  if (!updates.has(win))
    updates.set(
      win,
      coalesceUpdates(() => applyCurrent(win)),
    );
  return updates.get(win)();
}
async function applyCurrent(win) {
  const state = windows.get(win);
  if (!state || win.isDestroyed() || win.webContents.isDestroyed()) return;
  const s = readSettings();
  try {
    if (!win.webContents.getURL().startsWith('app://')) return;
    const css = cssFor(s, { codex: true });
    if (appliedCSS.get(win) === css) return;
    const baseline = s.enabled ? await evaluate(win.webContents, healthScript) : null;
    const after = s.enabled
      ? `return ${installControls};`
      : `${removeControls} return { restored: true };`;
    // The DOM is about to change. A failed apply must still run full cleanup,
    // even when the previous successful state was already disabled.
    appliedCSS.delete(win);
    const result = await evaluate(
      win.webContents,
      `(() => {
      let style=document.getElementById('companion-appearance-style');
      if (!style) { style=document.createElement('style'); style.id='companion-appearance-style'; document.head.append(style); }
      style.textContent=${JSON.stringify(css)};
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
      state.originalSetVibrancy?.(null);
      state.originalSetMaterial?.('none');
    } else {
      state.originalSetBackground(state.originalBackground);
      state.originalSetVibrancy?.(state.originalVibrancy);
      state.originalSetMaterial?.(state.originalMaterial);
    }
    appliedCSS.set(win, css);
    state.applied = s.enabled;
    log();
  } catch (e) {
    appliedCSS.delete(win);
    state.error = e.message;
    if (s.enabled) {
      // A partial apply must not strand an unusable style or transparent surface.
      try {
        await evaluate(
          win.webContents,
          `${removeControls} document.getElementById('companion-appearance-style')?.remove()`,
        );
        state.originalSetBackground(state.originalBackground);
        state.originalSetVibrancy?.(state.originalVibrancy);
        state.originalSetMaterial?.(state.originalMaterial);
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
          backgroundColor: readSettings().enabled ? '#00000000' : options.backgroundColor,
          ...(readSettings().enabled && process.platform === 'darwin' ? { vibrancy: null } : {}),
          ...(readSettings().enabled && process.platform === 'win32'
            ? { backgroundMaterial: 'none' }
            : {}),
          ...(process.platform === 'linux'
            ? { frame: false, titleBarStyle: 'hidden', hasShadow: false }
            : {}),
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
      originalVibrancy: options.vibrancy ?? null,
      originalMaterial: options.backgroundMaterial || 'auto',
      originalSetVibrancy: process.platform === 'darwin' ? this.setVibrancy?.bind(this) : null,
      originalSetMaterial:
        process.platform === 'win32' ? this.setBackgroundMaterial?.bind(this) : null,
    };
    windows.set(this, state);
    this.setBackgroundColor = (color) => {
      state.originalBackground = color;
      originalSetBackground(readSettings().enabled ? '#00000000' : color);
    };
    if (state.originalSetVibrancy)
      this.setVibrancy = (value) => {
        state.originalVibrancy = value;
        state.originalSetVibrancy(readSettings().enabled ? null : value);
      };
    if (state.originalSetMaterial)
      this.setBackgroundMaterial = (value) => {
        state.originalMaterial = value;
        state.originalSetMaterial(readSettings().enabled ? 'none' : value);
      };
    this.webContents.on('did-finish-load', () => {
      appliedCSS.delete(this);
      update(this);
      setTimeout(() => update(this), 2500);
      if (process.env.COMPANION_CHECK === '1')
        setTimeout(async () => {
          if (this.isDestroyed()) return;
          try {
            const { integrationCheck } = require(
              process.env.COMPANION_SIGNED_OUT_CHECK === '1'
                ? './signed-out-check.cjs'
                : './integration-check.cjs',
            );
            state.integration = await integrationCheck(this, () => update(this), {
              originalBackground: () => state.originalBackground,
            });
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
      if (input.type !== 'keyDown' || !(input.control || input.meta)) return;
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
  const stopWatching = watchSettings(SETTINGS, () => {
    for (const win of windows.keys()) update(win);
  });
  electron.app.on('before-quit', stopWatching);
  if (process.env.COMPANION_NATIVE_ACTIVE === '1') {
    const focusFile = path.join(STATE, 'native-focus.json');
    const stopFocus = watchSettings(focusFile, () => {
      try {
        const request = JSON.parse(fs.readFileSync(focusFile, 'utf8'));
        if (!['focus', 'ping'].includes(request.action) || !/^[a-f0-9-]{36}$/.test(request.nonce))
          return;
        const win = [...windows.keys()].find((value) => !value.isDestroyed());
        if (win) {
          if (request.action === 'focus') {
            if (win.isMinimized()) win.restore();
            win.show();
            win.focus();
          }
          fs.writeFileSync(
            path.join(STATE, 'native-focus-ack.json'),
            JSON.stringify({ action: request.action, nonce: request.nonce, pid: process.pid }),
            { mode: 0o600 },
          );
        }
      } catch {}
    });
    electron.app.on('before-quit', stopFocus);
  }
  log({ installed: true });
} catch (e) {
  log({ installed: false, error: e.message });
}
