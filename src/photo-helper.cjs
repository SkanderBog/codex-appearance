'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function photoCommand({
  packaged = process.env.COMPANION_PACKAGED === '1',
  resources = process.resourcesPath,
  platform = process.platform,
  python = process.env.COMPANION_PYTHON,
  root = path.resolve(__dirname, '..'),
} = {}) {
  if (packaged) {
    if (!resources) throw new Error('The bundled photo helper could not be located.');
    const executable = path.join(
      resources,
      'photo-helper',
      platform === 'win32' ? 'photo-helper.exe' : 'photo-helper',
    );
    if (!fs.existsSync(executable))
      throw new Error(
        'The bundled photo helper is missing. Extract the complete application again.',
      );
    return [executable, []];
  }
  return [
    python || (platform === 'win32' ? 'python' : 'python3'),
    [path.join(root, 'scripts/prepare-photo.py')],
  ];
}

function runPhotoHelper(args, bytes, maxBuffer) {
  const [executable, initialArgs] = photoCommand();
  return spawnSync(executable, [...initialArgs, ...args], {
    input: bytes,
    maxBuffer,
    timeout: 15000,
    windowsHide: true,
  });
}
module.exports = { photoCommand, runPhotoHelper };
