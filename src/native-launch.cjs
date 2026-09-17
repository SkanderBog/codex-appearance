'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { STATE, OUTPUT } = require('./paths.cjs');
const { discoverInstall } = require('./native-install.cjs');
const {
  connectInspector,
  inspectorEndpoint,
  waitForInspectorClosed,
} = require('./inspector-client.cjs');
function childEndpoint(child) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const cleanup = () => {
      clearTimeout(timer);
      child.stderr.removeListener('data', data);
      child.removeListener('error', error);
      child.removeListener('exit', exited);
    };
    const error = (value) => {
      cleanup();
      reject(value);
    };
    const exited = () =>
      error(new Error('Codex exited before its prototype appearance could start.'));
    const data = (chunk) => {
      buffer += chunk.toString();
      if (buffer.length > 65536) return error(new Error('Codex produced too much startup output.'));
      const endpoint = buffer.match(/Debugger listening on (ws:\/\/[^\s]+)/)?.[1];
      if (endpoint) {
        try {
          inspectorEndpoint(endpoint);
          cleanup();
          resolve(endpoint);
        } catch (failure) {
          error(failure);
        }
      }
    };
    const timer = setTimeout(
      () =>
        error(
          new Error(
            'Codex did not offer its supported startup inspector. No security settings were changed.',
          ),
        ),
      15000,
    );
    child.stderr.on('data', data);
    child.once('error', error);
    child.once('exit', exited);
  });
}
async function bootstrap(client, hook) {
  const paused = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Codex did not pause at application startup.')),
      10000,
    );
    client.on('Debugger.paused', (value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
  // Register the rejection immediately, even if enabling the debugger fails.
  paused.catch(() => {});
  await client.send('Debugger.enable');
  await client.send('Runtime.runIfWaitingForDebugger');
  const pause = await paused;
  const frame = pause.callFrames?.[0]?.callFrameId;
  if (!frame) throw new Error('Codex startup frame was unavailable.');
  const result = await client.send('Debugger.evaluateOnCallFrame', {
    callFrameId: frame,
    expression: `(() => { const installed = require(${JSON.stringify(hook)}).install(); setImmediate(() => require('node:inspector').close()); return installed; })()`,
    returnByValue: true,
  });
  if (result.exceptionDetails || result.result?.value !== true)
    throw new Error('Codex could not load the prototype appearance at startup.');
  await client.send('Debugger.resume');
}
async function launchNative({ smoke = false, install, spawnImpl = spawn, signal } = {}) {
  if (!smoke) {
    const existing = await require('./native-session.cjs').reconnectSession();
    if (existing) return existing;
  }
  if (signal?.aborted) throw new Error('Native startup was cancelled.');
  install ||= discoverInstall();
  const profile = path.join(STATE, smoke ? 'native-smoke-profile' : 'native-codex-profile');
  fs.mkdirSync(profile, { recursive: true, mode: 0o700 });
  const env = {
    ...process.env,
    CODEX_ELECTRON_USER_DATA_PATH: profile,
    COMPANION_NATIVE_ACTIVE: '1',
    COMPANION_MODE: 'codex-native',
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NODE_OPTIONS;
  if (smoke) {
    // A fresh child-only auth home proves styling before sign-in without touching
    // the user's login or credential store. The real CODEX_HOME is unchanged.
    const authHome = fs.mkdtempSync(path.join(STATE, 'native-smoke-auth-'));
    fs.writeFileSync(path.join(authHome, 'config.toml'), 'cli_auth_credentials_store = "file"\n', {
      mode: 0o600,
    });
    env.CODEX_HOME = authHome;
    for (const key of Object.keys(env))
      if (/^(OPENAI_API_KEY|CODEX_API_KEY|CODEX_AUTH_TOKEN|CHATGPT_AUTH_TOKEN)$/.test(key))
        delete env[key];
    env.COMPANION_CHECK = '1';
    env.COMPANION_SIGNED_OUT_CHECK = '1';
    env.COMPANION_CHECK_EXIT = '1';
  }
  const child = spawnImpl(install.executable, ['--inspect-brk=127.0.0.1:0'], {
    cwd: path.dirname(install.executable),
    env,
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: false,
  });
  const cancel = () => {
    if (child.exitCode === null) child.kill();
  };
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  // Drain stderr without persisting potential account or application diagnostics.
  let client;
  try {
    const endpoint = await childEndpoint(child);
    child.stderr.resume();
    client = await connectInspector(endpoint);
    await bootstrap(client, path.join(__dirname, 'native-hook.cjs'));
    client.close();
    client = null;
    await waitForInspectorClosed(endpoint);
    if (child.exitCode !== null) throw new Error('Codex closed during appearance startup.');
    if (smoke) {
      fs.mkdirSync(OUTPUT, { recursive: true, mode: 0o700 });
      fs.writeFileSync(
        path.join(OUTPUT, 'native-smoke-report.json'),
        JSON.stringify({
          passed: true,
          inspectorClosed: true,
          platform: process.platform,
          architecture: process.arch,
          codexVersion: install.version,
        }),
        { mode: 0o600 },
      );
      const timer = setTimeout(() => {
        if (child.exitCode === null) child.kill();
      }, 90000);
      timer.unref();
      child.once('exit', () => clearTimeout(timer));
    }
    return child;
  } catch (error) {
    client?.close();
    if (child.exitCode === null) child.kill();
    throw error;
  } finally {
    signal?.removeEventListener('abort', cancel);
  }
}
function focusNative() {
  return require('./native-session.cjs').requestSession('focus');
}
module.exports = { childEndpoint, bootstrap, launchNative, focusNative };
