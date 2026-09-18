'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const {
  inspectorEndpoint,
  connectInspector,
  waitForInspectorClosed,
} = require('../src/inspector-client.cjs');
const { childEndpoint, bootstrap } = require('../src/native-launch.cjs');
const { readEntry, inspectInstall } = require('../src/native-install.cjs');
function writeTinyAsar(destination, files) {
  const header = { files: {} };
  let offset = 0;
  for (const [name, data] of files) {
    const parts = name.split('/');
    let node = header.files;
    for (const part of parts.slice(0, -1)) {
      if (!node[part] || typeof node[part] !== 'object' || !node[part].files)
        node[part] = { files: {} };
      node = node[part].files;
    }
    node[parts.at(-1)] = { size: data.length, offset: String(offset) };
    offset += data.length;
  }
  const json = Buffer.from(JSON.stringify(header));
  const padding = Buffer.alloc((4 - (json.length % 4)) % 4);
  const headerSize = 8 + json.length + padding.length;
  const prefix = Buffer.alloc(16);
  prefix.writeUInt32LE(4, 0);
  prefix.writeUInt32LE(headerSize, 4);
  prefix.writeUInt32LE(headerSize - 4, 8);
  prefix.writeUInt32LE(json.length, 12);
  fs.writeFileSync(
    destination,
    Buffer.concat([prefix, json, padding, ...files.map(([, data]) => data)]),
  );
}
function nativeFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'appearance-native-fixture-'));
  fs.mkdirSync(path.join(directory, 'resources'));
  fs.writeFileSync(path.join(directory, 'ChatGPT.exe'), 'fixture');
  const archive = path.join(directory, 'resources', 'app.asar');
  writeTinyAsar(archive, [
    [
      'package.json',
      Buffer.from(JSON.stringify({ version: '99.0.0', main: '.vite/build/early-bootstrap.js' })),
    ],
    ['.vite/build/main-example.js', Buffer.from('new Example.BrowserWindow({});')],
    ['.vite/build/early-bootstrap.js', Buffer.from('require("electron");')],
  ]);
  return { directory, archive };
}
test('Native inspector accepts only exact local owned-process endpoints', () => {
  assert.equal(inspectorEndpoint('ws://127.0.0.1:9230/abc-def').port, '9230');
  for (const endpoint of [
    'ws://localhost:9230/abc',
    'ws://192.168.1.1:9230/a',
    'wss://127.0.0.1:9230/a',
    'ws://user@127.0.0.1:9230/a',
    'ws://127.0.0.1:9230/a?token=secret',
  ])
    assert.throws(() => inspectorEndpoint(endpoint));
});
test('Adaptive native inspection reads version and fingerprints without modifying the archive', () => {
  const { directory, archive } = nativeFixture();
  try {
    const before = fs.readFileSync(archive);
    const install = inspectInstall(directory, 'win32', 'x64', { adaptive: true });
    assert.equal(install.version, '99.0.0');
    assert.equal(install.main, '.vite/build/main-example.js');
    assert.equal(install.adaptive, true);
    assert.match(install.mainSha256, /^[0-9a-f]{64}$/);
    assert.notEqual(install.mainSha256, install.earlyBootstrapSha256);
    assert.deepEqual(fs.readFileSync(archive), before);
    assert.throws(() => inspectInstall(directory, 'win32', 'x64', { adaptive: false }));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
test('Read-only archive reader rejects malformed archive without modifying it', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'appearance-native-'));
  try {
    const file = path.join(directory, 'app.asar'),
      original = Buffer.alloc(16, 255);
    fs.writeFileSync(file, original);
    assert.throws(() => readEntry(file, 'package.json'));
    assert.throws(() => readEntry(file, '../package.json'));
    assert.deepEqual(fs.readFileSync(file), original);
    assert.throws(() => inspectInstall(directory, 'darwin', 'x64'), /does not support/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
test(
  'Owned Node startup installs hook before entry, resumes, and closes inspector',
  { timeout: 20000 },
  async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'appearance-bootstrap-'));
    let child, client;
    try {
      const main = path.join(directory, 'entry.cjs'),
        hook = path.join(directory, 'hook.cjs'),
        result = path.join(directory, 'result.json');
      fs.writeFileSync(
        main,
        `require('node:fs').writeFileSync(${JSON.stringify(result)}, JSON.stringify({ installed: global.injected === true })); setTimeout(() => {}, 15000);`,
      );
      fs.writeFileSync(hook, 'exports.install = () => { global.injected = true; return true; };');
      child = spawn(process.execPath, ['--inspect-brk=127.0.0.1:0', main], {
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      const endpoint = await childEndpoint(child);
      child.stderr.resume();
      client = await connectInspector(endpoint);
      await bootstrap(client, hook);
      client.close();
      client = null;
      await waitForInspectorClosed(endpoint);
      for (let i = 0; i < 50 && !fs.existsSync(result); i++)
        await new Promise((resolve) => setTimeout(resolve, 20));
      assert.equal(JSON.parse(fs.readFileSync(result)).installed, true);
      assert.equal(
        fs.readFileSync(hook, 'utf8'),
        'exports.install = () => { global.injected = true; return true; };',
      );
    } finally {
      client?.close();
      if (child && child.exitCode === null) {
        const exited = new Promise((resolve) => child.once('exit', resolve));
        child.kill();
        await exited;
      }
      fs.rmSync(directory, { recursive: true, force: true });
    }
  },
);
test('Native windows preserve controls and restore original material with No look', async () => {
  const vm = require('node:vm');
  const { EventEmitter } = require('node:events');
  for (const platform of ['darwin', 'win32']) {
    let settings = { enabled: true },
      changed;
    class FakeWindow extends EventEmitter {
      constructor(options) {
        super();
        this.options = options;
        this.id = 1;
        this.webContents = Object.assign(new EventEmitter(), {
          getURL: () => 'app://codex',
          isDestroyed: () => false,
        });
      }
      isDestroyed() {
        return false;
      }
      setBackgroundColor(value) {
        this.color = value;
      }
      setVibrancy(value) {
        this.vibrancy = value;
      }
      setBackgroundMaterial(value) {
        this.material = value;
      }
    }
    const electron = { BrowserWindow: FakeWindow, app: { getVersion: () => 'test', on() {} } };
    const dependencies = {
      electron,
      'node:fs': { mkdirSync() {}, writeFileSync() {} },
      'node:path': path,
      './evaluate.cjs': { evaluate: async () => ({}) },
      './controls.cjs': { installControls: '({})', removeControls: '' },
      './updates.cjs': {
        coalesceUpdates: (callback) => callback,
        watchSettings: (_file, callback) => {
          changed = callback;
          return () => {};
        },
      },
      './layout-health.cjs': { healthScript: '', layoutFailures: () => [] },
      './core.cjs': {
        STATE: '/test',
        SETTINGS: '/test/appearance.json',
        readSettings: () => settings,
        cssFor: (value) => (value.enabled ? 'body{}' : ''),
        saveSettings: (value) => {
          settings = value;
        },
      },
    };
    const context = {
      require: (name) => {
        assert.ok(name in dependencies, name);
        return dependencies[name];
      },
      module: { exports: {} },
      process: { platform, env: {}, pid: 1 },
      setTimeout,
      Map,
      WeakMap,
    };
    vm.runInNewContext(
      fs.readFileSync(path.join(__dirname, '../src/codex-hook.cjs'), 'utf8'),
      context,
    );
    const options = {
      webPreferences: { webviewTag: true },
      backgroundColor: '#223344',
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 8, y: 8 },
      titleBarOverlay: { height: 32 },
      vibrancy: 'sidebar',
      backgroundMaterial: 'mica',
    };
    const window = new context.module.exports.StyledWindow(options);
    assert.equal(window.options.titleBarStyle, options.titleBarStyle);
    assert.equal(window.options.trafficLightPosition, options.trafficLightPosition);
    assert.equal(window.options.titleBarOverlay, options.titleBarOverlay);
    assert.equal(window.options.frame, undefined);
    if (platform === 'darwin') {
      assert.equal(window.options.vibrancy, null);
      window.setVibrancy('sidebar');
      assert.equal(window.vibrancy, null);
    } else {
      assert.equal(window.options.backgroundMaterial, 'none');
      window.setBackgroundMaterial('mica');
      assert.equal(window.material, 'none');
    }
    window.setBackgroundColor('#445566');
    assert.equal(window.color, '#00000000');
    settings = { enabled: false };
    changed();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(window.color, '#445566');
    if (platform === 'darwin') assert.equal(window.vibrancy, 'sidebar');
    else assert.equal(window.material, 'mica');
  }
});
test('Restart reconnects only after a fresh private nonce response and never kills the existing process', async () => {
  const { requestSession, reconnectSession } = require('../src/native-session.cjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'appearance-reconnect-'));
  let watcher, session;
  try {
    fs.writeFileSync(
      path.join(directory, 'codex-bridge.json'),
      JSON.stringify({ mode: 'codex-native', pid: process.pid }),
    );
    fs.writeFileSync(
      path.join(directory, 'native-focus-ack.json'),
      JSON.stringify({ action: 'focus', nonce: 'stale', pid: process.pid }),
    );
    assert.equal(
      await requestSession('focus', directory, 100),
      null,
      'A stale acknowledgement cannot adopt another process',
    );
    await assert.rejects(reconnectSession(directory), /did not respond/);
    watcher = fs.watch(directory, (_event, filename) => {
      if (String(filename) !== 'native-focus.json') return;
      const request = JSON.parse(fs.readFileSync(path.join(directory, 'native-focus.json')));
      fs.writeFileSync(
        path.join(directory, 'native-focus-ack.json'),
        JSON.stringify({ ...request, pid: process.pid }),
      );
    });
    session = await reconnectSession(directory);
    assert.equal(session.pid, process.pid);
    assert.equal(session.reconnected, true);
    assert.equal(session.exitCode, null);
    assert.equal(
      session.kill,
      undefined,
      'Reconnected sessions have no process termination capability',
    );
    fs.writeFileSync(
      path.join(directory, 'codex-bridge.json'),
      JSON.stringify({ mode: 'codex-test', pid: process.pid }),
    );
    assert.equal(
      await reconnectSession(directory),
      null,
      'Only a native styled session can be reconnected',
    );
  } finally {
    session?.dispose();
    watcher?.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
test('Editor close hides during native startup/session, while explicit quit and ended sessions close normally', () => {
  const { bindEditorLifecycle } = require('../src/native-session.cjs');
  const { EventEmitter } = require('node:events');
  const window = new EventEmitter();
  let active = false,
    quitting = false,
    hidden = false,
    prevented = false;
  window.hide = () => {
    hidden = true;
  };
  bindEditorLifecycle(
    window,
    () => active,
    () => quitting,
  );
  function close() {
    hidden = false;
    prevented = false;
    window.emit('close', {
      preventDefault() {
        prevented = true;
      },
    });
  }
  active = true;
  close();
  assert.ok(hidden && prevented);
  quitting = true;
  close();
  assert.ok(!hidden && !prevented);
  quitting = false;
  active = false;
  close();
  assert.ok(!hidden && !prevented);
  active = true;
  close();
  assert.ok(hidden && prevented);
});
