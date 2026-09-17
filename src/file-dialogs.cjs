'use strict';
// Use the installed GTK picker without depending on the application runtime dialog API.
// Arguments are passed directly, never through a shell.
const { spawn } = require('node:child_process');
let active = null;
function pick(options, save = false) {
  if (active) return Promise.reject(new Error('Finish choosing a file in the open dialog first.'));
  return new Promise((resolve, reject) => {
    const args = ['--file-selection', '--title=' + options.title];
    if (options.defaultPath) args.push('--filename=' + options.defaultPath);
    if (save) args.push('--save', '--confirm-overwrite');
    for (const filter of options.filters || [])
      args.push(
        '--file-filter=' +
          filter.name +
          ' | ' +
          filter.extensions.flatMap((x) => ['*.' + x, '*.' + x.toUpperCase()]).join(' '),
      );
    const child = spawn('zenity', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    active = child;
    let output = '',
      errorText = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (s) => {
      output += s;
      if (output.length > 1024 * 1024) child.kill();
    });
    child.stderr.on('data', (s) => {
      errorText = (errorText + s).slice(-2000);
    });
    child.on('error', (error) => {
      active = null;
      reject(new Error('The file picker could not open: ' + error.message));
    });
    child.on('close', (code, signal) => {
      active = null;
      if (code === 1 || signal)
        return resolve(save ? { canceled: true } : { canceled: true, filePaths: [] });
      if (code !== 0)
        return reject(new Error('The file picker could not open. ' + errorText.trim()));
      const file = output.replace(/\r?\n$/, '');
      if (!file) return resolve(save ? { canceled: true } : { canceled: true, filePaths: [] });
      resolve(save ? { canceled: false, filePath: file } : { canceled: false, filePaths: [file] });
    });
  });
}
module.exports = {
  showOpenDialog: (_parent, options) => pick(options),
  showSaveDialog: (_parent, options) => pick(options, true),
  cancelAll: () => active?.kill(),
};
