'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
for (const name of fs
  .readFileSync(path.join(root, 'release-files.txt'), 'utf8')
  .trim()
  .split('\n')) {
  const file = path.join(root, name);
  const args = /\.(cjs|js)$/.test(name)
    ? [process.execPath, ['--check', file]]
    : name.endsWith('.sh')
      ? ['bash', ['-n', file]]
      : null;
  if (args) {
    const result = spawnSync(...args, { stdio: 'inherit' });
    if (result.status !== 0) process.exit(1);
  }
}
const pythonFiles = fs
  .readFileSync(path.join(root, 'release-files.txt'), 'utf8')
  .trim()
  .split('\n')
  .filter((name) => name.endsWith('.py'))
  .map((name) => path.join(root, name));
const python = spawnSync(
  process.env.COMPANION_PYTHON || 'python3',
  [
    '-c',
    'import ast, pathlib, sys; [ast.parse(pathlib.Path(p).read_text(), filename=p) for p in sys.argv[1:]]',
    ...pythonFiles,
  ],
  { stdio: 'inherit' },
);
if (python.status !== 0) process.exit(1);
console.log('JavaScript, Python, and shell syntax checks passed.');
