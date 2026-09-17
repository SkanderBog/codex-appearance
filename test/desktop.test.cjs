'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
test('Standalone metadata does not read an installed Codex archive or source record', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'appearance standalone '));
  try {
    fs.writeFileSync(path.join(folder, 'source.json'), 'invalid Codex metadata');
    const result = spawnSync(
      process.execPath,
      ['-e', "console.log(JSON.stringify(require('./src/runtime-info.cjs').runtimeInfo()))"],
      {
        cwd: root,
        env: { ...process.env, COMPANION_STANDALONE: '1', COMPANION_RUNTIME_DIR: folder },
        encoding: 'utf8',
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      canLaunchCodex: false,
      version: null,
      standalone: true,
    });
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});
test('Native default storage agrees between Node and Python', () => {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('COMPANION_')),
  );
  const python =
    process.env.COMPANION_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  const js = spawnSync(
    process.execPath,
    [
      '-e',
      "const p=require('./src/paths.cjs'); console.log(JSON.stringify([p.STATE,p.RUNTIME,p.OUTPUT]))",
    ],
    { cwd: root, env, encoding: 'utf8' },
  );
  const py = spawnSync(
    python,
    [
      '-c',
      "import sys,json;sys.path.insert(0,'scripts');import paths;print(json.dumps(list(map(str,paths.storage_paths()))))",
    ],
    { cwd: root, env, encoding: 'utf8' },
  );
  assert.equal(js.status, 0, js.stderr);
  assert.equal(py.status, 0, py.stderr);
  assert.deepEqual(JSON.parse(js.stdout), JSON.parse(py.stdout));
});
