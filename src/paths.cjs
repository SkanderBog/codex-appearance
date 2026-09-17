'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');

function absoluteEnv(name, fallback) {
  const value = process.env[name] || fallback;
  if (!path.isAbsolute(value)) throw new Error(`${name} must be an absolute path.`);
  return value;
}

const data = absoluteEnv('XDG_DATA_HOME', path.join(os.homedir(), '.local/share'));
const cache = absoluteEnv('XDG_CACHE_HOME', path.join(os.homedir(), '.cache'));
const legacy = path.join(ROOT, '.state');
const STATE = absoluteEnv(
  'COMPANION_STATE_DIR',
  fs.existsSync(path.join(legacy, 'appearance.json'))
    ? legacy
    : path.join(data, 'codex-appearance'),
);
const installId = crypto.createHash('sha256').update(ROOT).digest('hex').slice(0, 12);
const RUNTIME = absoluteEnv(
  'COMPANION_RUNTIME_DIR',
  path.join(cache, 'codex-appearance', installId),
);
const OUTPUT = absoluteEnv('COMPANION_OUTPUT_DIR', path.join(STATE, 'diagnostics'));
module.exports = { ROOT, STATE, RUNTIME, OUTPUT };
