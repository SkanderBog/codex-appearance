'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { coalesceUpdates, watchSettings } = require('../src/updates.cjs');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('Rapid edits apply the latest value with one pending refresh', async () => {
  let release,
    value = 0;
  const values = [];
  const update = coalesceUpdates(async () => {
    values.push(value);
    if (values.length === 1) await new Promise((resolve) => (release = resolve));
  });
  const first = update();
  await Promise.resolve();
  for (value = 1; value <= 100; value++) assert.equal(update(), first);
  value = 100;
  release();
  await first;
  assert.deepEqual(values, [0, 100]);
  value = 101;
  await update();
  assert.deepEqual(values, [0, 100, 101]);
});

test('A failed refresh does not prevent later edits', async () => {
  let fail = true;
  const update = coalesceUpdates(async () => {
    if (fail) throw new Error('fixture failure');
  });
  await assert.rejects(update(), /fixture failure/);
  fail = false;
  await update();
});

test('Settings notifications survive atomic replacement and ignore unrelated files', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'appearance-watch-'));
  const file = path.join(directory, 'appearance.json');
  let calls = 0,
    value;
  const close = watchSettings(file, () => {
    calls++;
    value = JSON.parse(fs.readFileSync(file));
  });
  const replace = (number) => {
    fs.writeFileSync(file + '.tmp', JSON.stringify(number));
    fs.renameSync(file + '.tmp', file);
  };
  const waitFor = async (number) => {
    for (let i = 0; i < 100 && value !== number; i++) await sleep(20);
    assert.equal(value, number);
  };
  try {
    replace(1);
    await waitFor(1);
    replace(2);
    replace(3);
    await waitFor(3);
    const previous = calls;
    fs.writeFileSync(path.join(directory, 'bridge.json'), '{}');
    await sleep(120);
    assert.equal(calls, previous);
    close();
    replace(4);
    await sleep(120);
    assert.equal(calls, previous);
  } finally {
    close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('Photo cache avoids repeated reads while detecting replacement, deletion, and symlinks', () => {
  // Run with an isolated state directory; core must not use developer photos.
  const { spawnSync } = require('node:child_process');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'appearance-cache-'));
  try {
    const result = spawnSync(
      process.execPath,
      [
        '-e',
        `
      const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
      const { ASSETS, assetDataURL } = require('./src/core.cjs');
      fs.mkdirSync(ASSETS, { recursive:true });
      const id = 'a'.repeat(64)+'.jpg', file = path.join(ASSETS,id);
      fs.writeFileSync(file, 'first');
      let reads = 0;
      const read = fs.readFileSync;
      fs.readFileSync = function(name, ...args) { if (name===file) reads++; return read.call(this,name,...args); };
      const first = assetDataURL(id);
      for(let i=0;i<100;i++) assert.equal(assetDataURL(id),first);
      assert.equal(reads,1);
      fs.writeFileSync(file+'.tmp','other'); fs.renameSync(file+'.tmp',file);
      assert.notEqual(assetDataURL(id),first);
      assert.equal(reads,2);
      fs.unlinkSync(file);
      assert.equal(assetDataURL(id),'');
      fs.writeFileSync(file+'.target','hidden'); fs.symlinkSync(file+'.target',file);
      assert.equal(assetDataURL(id),'');
      fs.unlinkSync(file); fs.writeFileSync(file,'again');
      assert.ok(assetDataURL(id)); assert.equal(reads,3);
      fs.readFileSync = read;
    `,
      ],
      {
        cwd: path.resolve(__dirname, '..'),
        env: { ...process.env, COMPANION_STATE_DIR: directory },
        encoding: 'utf8',
      },
    );
    assert.equal(result.status, 0, result.stderr);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
