'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const info = JSON.parse(fs.readFileSync(path.join(root, 'dist/native/package-info.json'), 'utf8'));
const output = path.join(root, '.ci/native-results');
if (!process.env.COMPANION_CODEX_INSTALL)
  throw new Error('Prepare the reviewed Codex fixture before this test.');
const env = {
  ...process.env,
  COMPANION_MODE: 'native-smoke',
  COMPANION_STATE_DIR: path.join(root, '.ci/native-state'),
  COMPANION_OUTPUT_DIR: output,
  COMPANION_RUNTIME_DIR: path.join(root, '.ci/native-runtime'),
  COMPANION_PYTHON: path.join(root, '.ci/python-must-not-be-used'),
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.PYTHONHOME;
delete env.PYTHONPATH;
fs.rmSync(output, { recursive: true, force: true });
const result = spawnSync(info.executable, ['--native-smoke'], {
  env,
  stdio: 'inherit',
  timeout: 180000,
});
if (result.error) throw result.error;
if (result.status !== 0)
  throw new Error('Native Codex smoke test failed with status ' + result.status);
const signedOut = JSON.parse(fs.readFileSync(path.join(output, 'signed-out-report.json'), 'utf8'));
if (
  !signedOut.passed ||
  !signedOut.nativeStartupPhoto ||
  !signedOut.assertions.length ||
  signedOut.assertions.some((entry) => !entry.passed)
)
  throw new Error('Native signed-out appearance checks did not pass.');
if (
  !signedOut.photoPixels ||
  signedOut.photoPixels.translucent <= 10000 ||
  signedOut.photoPixels.photo <= 1000 ||
  signedOut.photoPixels.foreground <= 50
)
  throw new Error('Native photo/alpha/foreground screenshot evidence is missing.');
const launch = JSON.parse(fs.readFileSync(path.join(output, 'native-smoke-report.json'), 'utf8'));
if (!launch.passed || !launch.inspectorClosed || !launch.editorCloseHides || !launch.editorReopens)
  throw new Error('Native launch, inspector closure, or editor lifecycle checks did not pass.');
console.log(
  `Packaged ${info.platform}/${info.arch}: ${signedOut.assertions.length} native signed-out checks passed; startup inspector closed.`,
);
