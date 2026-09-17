'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const info = JSON.parse(fs.readFileSync(path.join(root, 'dist/native/package-info.json'), 'utf8'));
// Test the actual relocatable distribution, with its original helper build
// unavailable. A reference back to the packaging machine must fail here.
const relocated = path.join(root, '.ci/relocated application', path.basename(info.folder));
const relativeExecutable = path.relative(info.folder, info.executable);
fs.mkdirSync(path.dirname(relocated), { recursive: true });
fs.renameSync(info.folder, relocated);
info.folder = relocated;
info.executable = path.join(relocated, relativeExecutable);
fs.renameSync(
  path.join(root, 'dist/native/helper'),
  path.join(root, 'dist/native/helper-not-at-build-path'),
);
fs.writeFileSync(
  path.join(root, 'dist/native/package-info.json'),
  JSON.stringify(info, null, 2) + '\n',
);
const output = path.join(root, '.ci/packaged-results');
const env = {
  ...process.env,
  COMPANION_MODE: 'self-test',
  COMPANION_STATE_DIR: path.join(root, '.ci/packaged-state'),
  COMPANION_OUTPUT_DIR: output,
  COMPANION_RUNTIME_DIR: path.join(root, '.ci/no-codex-installation'),
  // A packaged test must not accidentally succeed through an installed Python.
  COMPANION_PYTHON: path.join(root, '.ci/python-must-not-be-used'),
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.PYTHONHOME;
delete env.PYTHONPATH;
fs.rmSync(output, { recursive: true, force: true });
const result = spawnSync(info.executable, ['--self-test'], {
  env,
  stdio: 'inherit',
  timeout: 180000,
});
if (result.error) throw result.error;
if (result.status !== 0)
  throw new Error('Packaged application failed with status ' + result.status);
const report = JSON.parse(fs.readFileSync(path.join(output, 'self-test-report.json'), 'utf8'));
if (!report.passed || !report.assertions.length || report.assertions.some((entry) => !entry.passed))
  throw new Error('Packaged graphical checks did not pass.');
console.log(
  `Packaged ${info.platform}/${info.arch}: ${report.assertions.length} graphical checks passed; external Python was disabled.`,
);
