'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { RUNTIME } = require('./paths.cjs');
const standalone = process.env.COMPANION_STANDALONE === '1' || process.platform !== 'linux';
const nativeEnabled =
  process.env.COMPANION_MODE !== 'self-test' &&
  ['darwin', 'win32'].includes(process.platform) &&
  (process.env.COMPANION_PACKAGED === '1' || process.env.COMPANION_NATIVE_ENABLED === '1');
function runtimeInfo() {
  if (nativeEnabled)
    return {
      canLaunchCodex: true,
      canLocateCodex: true,
      native: true,
      version: null,
      standalone: false,
    };
  if (standalone) return { canLaunchCodex: false, version: null, standalone: true };
  const metadata = JSON.parse(fs.readFileSync(path.join(RUNTIME, 'source.json'), 'utf8'));
  return { canLaunchCodex: true, version: metadata.version, standalone: false };
}
module.exports = { standalone, nativeEnabled, runtimeInfo };
