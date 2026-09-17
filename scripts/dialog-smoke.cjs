'use strict';
const { OUTPUT } = require('../src/paths.cjs');
const { app, BrowserWindow } = require('electron');
const dialog = require('../src/file-dialogs.cjs');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
fs.mkdirSync(OUTPUT, { recursive: true, mode: 0o700 });
const path = require('node:path');
const { ROOT } = require('../src/core.cjs');
const report = { time: new Date().toISOString(), passed: false, assertions: [] };
app.on('before-quit', () => dialog.cancelAll());
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({
      width: 440,
      height: 180,
      title: 'Appearance dialog test host',
      show: true,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    await win.loadURL(
      'data:text/html,<title>Appearance dialog test host</title><body style="font:14px sans-serif;background:%23151c19;color:white;padding:20px">Checking the native file picker. This window will close automatically.</body>',
    );
    for (const type of ['open', 'save']) {
      const expected =
        type === 'open'
          ? path.join(ROOT, 'test/fixtures/background.png')
          : path.join(OUTPUT, 'dialog-export-test.json');
      const options = {
        title: `Appearance picker ${process.pid} ${type}`,
        defaultPath: expected,
        ...(type === 'open'
          ? {
              properties: ['openFile'],
              filters: [{ name: 'Photos', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
            }
          : { filters: [{ name: 'Look', extensions: ['json'] }] }),
      };
      const helper = spawn(
        'python3',
        [
          path.join(ROOT, 'scripts/dialog-driver.py'),
          type === 'open' ? 'Open' : 'Save',
          options.title,
        ],
        { stdio: 'inherit' },
      );
      const task =
        type === 'open' ? dialog.showOpenDialog(win, options) : dialog.showSaveDialog(win, options);
      let timeout;
      const result = await Promise.race([
        task,
        new Promise((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('Native dialog automation timed out')),
            55000,
          );
        }),
      ]).finally(() => {
        clearTimeout(timeout);
        helper.kill();
      });
      console.log('Dialog result:', JSON.stringify(result));
      if (result.canceled || (type === 'open' ? result.filePaths[0] : result.filePath) !== expected)
        throw new Error('File picker did not return the expected test path');
      report.assertions.push({
        name: type + ' dialog returns the selected local path',
        passed: true,
      });
    }
    report.passed = true;
  } catch (error) {
    report.error = error.message;
  }
  dialog.cancelAll();
  fs.writeFileSync(path.join(OUTPUT, 'dialog-report.json'), JSON.stringify(report, null, 2));
  app.exit(report.passed ? 0 : 1);
});
