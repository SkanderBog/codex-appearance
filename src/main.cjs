'use strict';
const { app, BrowserWindow, ipcMain, clipboard, nativeImage, Tray, Menu } = require('electron');
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
const { standalone, nativeEnabled, runtimeInfo } = require('./runtime-info.cjs');
const history = [];
const future = [];
let lastChange = 0;
fs.mkdirSync(STATE, { recursive: true, mode: 0o700 });
app.setName('Codex Appearance Companion');
app.setPath('userData', path.join(STATE, 'companion-profile'));
let control, preview, launched, nativeLaunchPending, nativeTray, nativeAbort;
let quitting = false;
function showAppearance() {
  if (control && !control.isDestroyed()) {
    control.show();
    control.focus();
  }
}
function installNativeTray() {
  if (nativeTray || !nativeEnabled) return;
  const menu = Menu.buildFromTemplate([
    { label: 'Show appearance settings', click: showAppearance },
    {
      label: 'Open styled Codex',
      click: () =>
        launchCodex().catch((error) => {
          showAppearance();
          control.webContents.send('appearance:changed', { error: error.message });
        }),
    },
    { type: 'separator' },
    { label: 'Quit appearance companion', click: () => app.quit() },
  ]);
  nativeTray = new Tray(
    nativeImage
      .createFromPath(path.join(ROOT, 'assets/icon.png'))
      .resize({ width: 20, height: 20 }),
  );
  nativeTray.setToolTip('Codex Appearance');
  nativeTray.setContextMenu(menu);
  nativeTray.on('click', showAppearance);
  if (process.platform === 'darwin')
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'Codex Appearance', submenu: menu }]));
}
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
    ...runtimeInfo(),
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
async function launchCodex() {
  if (nativeEnabled) {
    if (launched && launched.exitCode === null) {
      await require('./native-launch.cjs').focusNative();
      return { ok: true, message: 'Styled Codex is already running.' };
    }
    if (nativeLaunchPending) return nativeLaunchPending;
    nativeAbort = new AbortController();
    nativeLaunchPending = (async () => {
      launched = await require('./native-launch.cjs').launchNative({
        smoke: process.argv.includes('--native-smoke'),
        signal: nativeAbort.signal,
      });
      const current = launched;
      current.once('exit', (code) => {
        if (launched === current) launched = null;
        if (process.argv.includes('--native-smoke')) app.exit(code ?? 1);
        else if (
          control &&
          !control.isDestroyed() &&
          !control.isVisible() &&
          (!preview || preview.isDestroyed() || !preview.isVisible())
        )
          app.quit();
      });
      return { ok: true, message: 'Opened styled Codex in its separate window profile.' };
    })();
    try {
      return await nativeLaunchPending;
    } finally {
      nativeLaunchPending = null;
      nativeAbort = null;
    }
  }
  if (standalone)
    throw new Error(
      'Styled Codex is not available in the standalone editor. You can edit, preview, save, and export looks locally.',
    );
  if (launched && launched.exitCode === null)
    return { ok: true, message: 'The separate Codex test window is already running.' };
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
}
handle('appearance:launch', launchCodex);
handle('appearance:locate-codex', async () => {
  if (!nativeEnabled) throw new Error('Native Codex integration is not enabled.');
  const result = await dialog.showOpenDialog(control, {
    title: 'Locate Codex',
    properties: process.platform === 'darwin' ? ['openFile', 'openDirectory'] : ['openFile'],
    ...(process.platform === 'win32'
      ? { filters: [{ name: 'Codex application', extensions: ['exe'] }] }
      : {}),
  });
  if (result.canceled || !result.filePaths.length) return null;
  require('./native-install.cjs').rememberInstall(result.filePaths[0]);
  return launchCodex();
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
app.on('before-quit', () => {
  quitting = true;
  nativeAbort?.abort();
  dialog.cancelAll();
});
app.on('activate', showAppearance);
app.on('window-all-closed', () => app.quit());
if (!app.requestSingleInstanceLock()) {
  app.exit(selfTest ? 1 : 0);
} else {
  app.on('second-instance', () => {
    if (nativeEnabled && launched && launched.exitCode === null) {
      showAppearance();
      require('./native-launch.cjs')
        .focusNative()
        .catch(() => {});
      return;
    }
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
    if (nativeEnabled)
      require('./native-session.cjs').bindEditorLifecycle(
        control,
        () => !!nativeLaunchPending || launched?.exitCode === null,
        () => quitting,
      );
    installNativeTray();
    control.setMenuBarVisibility(false);
    await control.loadFile(path.join(__dirname, 'index.html'));
    if (nativeEnabled && !selfTest) {
      try {
        if (process.argv.includes('--native-smoke')) {
          const photo = library.importPhoto(
            fs.readFileSync(path.join(ROOT, 'test/fixtures/background.png')),
            'Smoke background.png',
            nativeImage,
          );
          saveSettings({
            ...DEFAULTS,
            ...photo,
            preset: 'amber',
            opacity: 0.6,
            backgroundMode: 'photo',
            photoTint: 0.2,
            photoBlur: 0,
            photoFit: 'cover',
            photoX: 28,
            photoY: 50,
            homePhotoStrength: 1,
            taskPhotoStrength: 1,
            enabled: true,
          });
        }
        await launchCodex();
        if (process.argv.includes('--native-smoke')) {
          control.close();
          const editorCloseHides = !control.isDestroyed() && !control.isVisible();
          showAppearance();
          const editorReopens = !control.isDestroyed() && control.isVisible();
          const reportPath = path.join(require('./paths.cjs').OUTPUT, 'native-smoke-report.json');
          const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
          fs.writeFileSync(
            reportPath,
            JSON.stringify({
              ...report,
              passed: report.passed && editorCloseHides && editorReopens,
              editorCloseHides,
              editorReopens,
            }),
            { mode: 0o600 },
          );
          if (!editorCloseHides || !editorReopens)
            throw new Error('Native companion lifecycle check failed.');
        }
      } catch (error) {
        showAppearance();
        control.webContents.send('appearance:changed', { error: error.message });
        if (process.argv.includes('--native-smoke')) {
          console.error(error.message);
          launched?.kill?.();
          app.exit(1);
        }
      }
    }
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
