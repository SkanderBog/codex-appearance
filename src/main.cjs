'use strict';
const { app, BrowserWindow, ipcMain, clipboard, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { applyStyle } = require('./evaluate.cjs');
const { coalesceUpdates } = require('./updates.cjs');
const {
  ROOT,
  STATE,
  PRESETS,
  FONTS,
  DEFAULTS,
  assetDataURL,
  readSettings,
  normalize,
  saveSettings,
  cssFor,
  themeString,
} = require('./core.cjs');
const library = require('./library.cjs');
const dialog = require('./file-dialogs.cjs');
const { RUNTIME } = require('./paths.cjs');
const history = [];
const future = [];
let lastChange = 0;
fs.mkdirSync(STATE, { recursive: true, mode: 0o700 });
app.setName('Codex Appearance Companion');
app.setPath('userData', path.join(STATE, 'companion-profile'));
let control, preview, launched;
const selfTest = process.env.COMPANION_MODE === 'self-test';
const preload = path.join(__dirname, 'preload.cjs');
function makeWindow(options) {
  const win = new BrowserWindow({
    show: false,
    backgroundColor: '#11171C',
    icon: path.join(ROOT, 'assets/icon.png'),
    webPreferences: { preload, sandbox: true, contextIsolation: true, nodeIntegration: false },
    ...options,
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault();
  });
  win.once('ready-to-show', () => win.show());
  return win;
}
const previewStyles = new WeakMap();
const refreshPreview = coalesceUpdates(async () => {
  const win = preview;
  if (!win || win.isDestroyed() || win.isMinimized() || !win.isVisible()) return;
  try {
    const settings = readSettings();
    const css = cssFor(settings);
    if (previewStyles.get(win) !== css) {
      await applyStyle(win.webContents, css);
      previewStyles.set(win, css);
    }
    if (!win.isDestroyed()) win.webContents.send('appearance:changed', settings);
  } catch (error) {
    if (!win.isDestroyed()) console.error('Preview update failed:', error.message);
  }
});
async function openPreview() {
  if (preview && !preview.isDestroyed()) {
    preview.show();
    preview.focus();
    return;
  }
  preview = makeWindow({
    title: 'Codex · appearance preview',
    width: 850,
    height: 610,
    minWidth: 540,
    minHeight: 380,
    transparent: true,
    frame: false,
    hasShadow: false,
    backgroundColor: '#00000000',
  });
  preview.on('closed', () => {
    preview = null;
  });
  preview.on('restore', refreshPreview);
  preview.on('show', refreshPreview);
  await preview.loadFile(path.join(__dirname, 'preview.html'));
  previewStyles.delete(preview);
  await refreshPreview();
}
function notify(value) {
  if (control && !control.isDestroyed()) control.webContents.send('appearance:changed', value);
  refreshPreview();
}
function allowed(event) {
  return (
    [control, preview].some(
      (win) => win && !win.isDestroyed() && win.webContents === event.sender,
    ) && event.senderFrame === event.sender.mainFrame
  );
}
function handle(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!allowed(event)) throw new Error('This action is only available in the companion window.');
    return handler(...args);
  });
}
function snapshot() {
  const settings = readSettings();
  let layoutRestored = false;
  try {
    const bridge = JSON.parse(fs.readFileSync(path.join(STATE, 'codex-bridge.json'), 'utf8'));
    layoutRestored =
      !settings.enabled && bridge.windows?.some((win) => win.healthFailures?.length > 0);
  } catch {}
  return {
    settings,
    presets: PRESETS,
    fonts: FONTS,
    previewCSS: cssFor(settings, { embedded: true }),
    photoData: assetDataURL(settings.photo),
    looks: library.readLooks(),
    builtIns: library.builtInLooks(),
    layoutRestored: !!layoutRestored,
    canUndo: history.length > 0,
    canRedo: future.length > 0,
    appVersion: require('../package.json').version,
    version: JSON.parse(fs.readFileSync(path.join(RUNTIME, 'source.json'), 'utf8')).version,
  };
}
function commit(patch, force = false) {
  const before = readSettings();
  const next = normalize({ ...before, ...patch });
  if (JSON.stringify(before) === JSON.stringify(next)) return snapshot();
  const saved = saveSettings(next);
  if (force || Date.now() - lastChange > 600) {
    history.push(before);
    if (history.length > 30) history.shift();
  }
  lastChange = Date.now();
  future.length = 0;
  notify(saved);
  return snapshot();
}
handle('appearance:read', snapshot);
handle('appearance:save', (patch) =>
  commit(patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {}),
);
handle('appearance:restore', () => commit({ enabled: false }, true));
handle('appearance:reset', () => commit(DEFAULTS, true));
handle('appearance:undo', () => {
  const previous = history.at(-1);
  if (previous) {
    const current = readSettings();
    saveSettings(previous);
    history.pop();
    future.push(current);
    notify(previous);
  }
  lastChange = 0;
  return snapshot();
});
handle('appearance:redo', () => {
  const next = future.at(-1);
  if (next) {
    const current = readSettings();
    saveSettings(next);
    future.pop();
    history.push(current);
    notify(next);
  }
  lastChange = 0;
  return snapshot();
});
handle('appearance:match-photo', () =>
  commit(
    { ...library.photoPalette(readSettings().photo), customColors: true, enabled: true },
    true,
  ),
);
handle('appearance:pick-photo', async () => {
  const result = await dialog.showOpenDialog(control, {
    title: 'Choose a background photo',
    properties: ['openFile'],
    filters: [{ name: 'Photos', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
  });
  if (result.canceled || !result.filePaths.length) return null;
  const file = result.filePaths[0];
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > library.MAX_IMAGE)
    throw new Error('Choose an image under 20 MB.');
  return commit(
    {
      ...library.importPhoto(fs.readFileSync(file), path.basename(file), nativeImage),
      enabled: true,
    },
    true,
  );
});
handle('appearance:drop-photo', (data) => {
  if (!data || typeof data !== 'object') throw new Error('No photo was selected.');
  return commit(
    {
      ...library.importPhoto(library.decodeBase64(data.bytes), data.name, nativeImage),
      enabled: true,
    },
    true,
  );
});
handle('appearance:save-look', (name) => {
  library.saveLook(name, readSettings());
  return snapshot();
});
handle('appearance:update-look', (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Choose a saved look to update.');
  library.updateLook(value.id, value.name, readSettings());
  return snapshot();
});
handle('appearance:load-look', (id) => {
  const look = library.readLooks().find((x) => x.id === id);
  if (!look) throw new Error('This look could not be found.');
  return commit({ ...look.settings, enabled: true }, true);
});
handle('appearance:load-built-in', (id) =>
  commit({ ...DEFAULTS, ...library.loadBuiltIn(id) }, true),
);
handle('appearance:delete-look', (id) => {
  library.deleteLook(id);
  return snapshot();
});
handle('appearance:export-look', async (name) => {
  const result = await dialog.showSaveDialog(control, {
    title: 'Export your current look',
    defaultPath: 'My Codex Look.json',
    filters: [{ name: 'Codex appearance look', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return false;
  fs.writeFileSync(result.filePath, library.exportLook(name, readSettings()), { mode: 0o600 });
  return true;
});
handle('appearance:import-look', async () => {
  const result = await dialog.showOpenDialog(control, {
    title: 'Import a saved look',
    properties: ['openFile'],
    filters: [{ name: 'Codex appearance look', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePaths.length) return null;
  const file = result.filePaths[0];
  if (!fs.statSync(file).isFile() || fs.statSync(file).size > 30 * 1024 * 1024)
    throw new Error('This look file is too large.');
  const look = library.importLook(fs.readFileSync(file, 'utf8'), nativeImage);
  library.saveLook(look.name, look.settings);
  return snapshot();
});
handle('appearance:preview', async () => {
  await openPreview();
  return true;
});
handle('appearance:copy-theme', () => {
  clipboard.writeText(themeString(readSettings()));
  return true;
});
handle('appearance:launch', () => {
  if (launched && launched.exitCode === null)
    return { ok: true, message: 'The separate Codex test window is already running.' };
  commit({ enabled: true });
  const file = fs.openSync(path.join(STATE, 'codex-test.log'), 'a', 0o600);
  launched = spawn(path.join(ROOT, 'launch.sh'), ['codex-test'], {
    cwd: ROOT,
    stdio: ['ignore', file, file],
    env: { ...process.env, COMPANION_ROOT: ROOT },
  });
  fs.closeSync(file);
  const launchError = (message) => {
    if (control && !control.isDestroyed())
      control.webContents.send('appearance:changed', { error: message });
  };
  launched.on('error', () => {
    launched = null;
    launchError('Styled Codex could not start. Run ./launch.sh doctor.');
  });
  launched.on('exit', (code) => {
    launched = null;
    if (code) launchError('Styled Codex exited with an error. Check your local codex-test.log.');
  });
  return { ok: true, message: 'Opening a separate Codex test profile. No prompt is sent.' };
});
ipcMain.on('appearance:window', (event, action) => {
  if (!allowed(event)) return;
  const win = BrowserWindow.fromWebContents(event.sender);
  if (action === 'minimize') win.minimize();
  else if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
});
ipcMain.on('appearance:close', (event) => {
  if (allowed(event)) BrowserWindow.fromWebContents(event.sender)?.close();
});
app.on('before-quit', () => dialog.cancelAll());
app.on('window-all-closed', () => app.quit());
if (!app.requestSingleInstanceLock()) {
  app.exit(selfTest ? 1 : 0);
} else {
  app.on('second-instance', () => {
    if (control && !control.isDestroyed()) {
      control.show();
      control.focus();
    }
  });
  app.whenReady().then(async () => {
    if (!fs.existsSync(path.join(STATE, 'appearance.json'))) saveSettings(DEFAULTS);
    control = makeWindow({
      title: 'Codex Appearance Companion',
      width: 1180,
      height: 780,
      minWidth: 900,
      minHeight: 620,
      frame: false,
    });
    control.setMenuBarVisibility(false);
    await control.loadFile(path.join(__dirname, 'index.html'));
    if (selfTest) {
      try {
        await require('./self-test.cjs').runSelfTest({
          control,
          openPreview,
          getPreview: () => preview,
          notify,
          snapshot,
          commit,
          nativeImage,
          dialog,
        });
        app.exit(0);
      } catch (error) {
        console.error(error.stack);
        app.exit(1);
      }
    }
  });
}
