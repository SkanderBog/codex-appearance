'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { STATE } = require('./paths.cjs');
function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}
async function requestSession(action, directory = STATE, timeout = 1800) {
  const nonce = crypto.randomUUID();
  fs.writeFileSync(path.join(directory, 'native-focus.json'), JSON.stringify({ action, nonce }), {
    mode: 0o600,
  });
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      const ack = JSON.parse(
        fs.readFileSync(path.join(directory, 'native-focus-ack.json'), 'utf8'),
      );
      if (ack.nonce === nonce && ack.action === action && Number.isInteger(ack.pid) && ack.pid > 0)
        return ack;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  return null;
}
async function reconnectSession(directory = STATE) {
  let bridge;
  try {
    bridge = JSON.parse(fs.readFileSync(path.join(directory, 'codex-bridge.json'), 'utf8'));
  } catch {
    return null;
  }
  if (bridge.mode !== 'codex-native' || !alive(bridge.pid)) return null;
  const ack = await requestSession('focus', directory);
  if (!ack || ack.pid !== bridge.pid)
    throw new Error(
      'Your styled Codex window is still running but did not respond. Close that window before opening a new one.',
    );
  const session = new EventEmitter();
  session.pid = ack.pid;
  session.exitCode = null;
  session.reconnected = true;
  // The existing process is never terminated or debugged. This is only a
  // liveness check; all focus requests use a fresh private nonce handshake.
  const timer = setInterval(() => {
    if (!alive(session.pid)) {
      clearInterval(timer);
      session.exitCode = 0;
      session.emit('exit', 0);
    }
  }, 3000);
  timer.unref();
  session.dispose = () => clearInterval(timer);
  return session;
}
function bindEditorLifecycle(window, shouldKeepAlive, isQuitting) {
  window.on('close', (event) => {
    if (!isQuitting() && shouldKeepAlive()) {
      event.preventDefault();
      window.hide();
    }
  });
}
module.exports = { alive, requestSession, reconnectSession, bindEditorLifecycle };
