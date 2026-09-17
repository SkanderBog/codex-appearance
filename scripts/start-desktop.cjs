'use strict';
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const mode = process.argv[2] || 'companion';
if (!['companion', 'self-test'].includes(mode)) {
  console.error('Usage: node scripts/start-desktop.cjs [companion|self-test]');
  process.exit(2);
}
const python =
  process.env.COMPANION_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const probe = spawnSync(
  python,
  [
    '-c',
    'import sys, PIL; assert sys.version_info >= (3,10); assert int(PIL.__version__.split(".")[0]) >= 9',
  ],
  { windowsHide: true, timeout: 15000 },
);
if (probe.error || probe.status !== 0) {
  console.error(
    'Install Python 3.10+ and Pillow 9+, or set COMPANION_PYTHON to your Python executable.',
  );
  process.exit(1);
}
let binary;
try {
  binary = require(path.join(root, 'desktop/node_modules/electron'));
} catch {
  console.error('Install the standalone runtime first: npm ci --prefix desktop');
  process.exit(1);
}
const env = {
  ...process.env,
  COMPANION_MODE: mode,
  COMPANION_STANDALONE: '1',
  COMPANION_PYTHON: python,
};
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(binary, [path.join(root, 'desktop/main.cjs')], {
  env,
  stdio: 'inherit',
  windowsHide: false,
});
child.on('error', (error) => {
  console.error('Could not start the editor:', error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
