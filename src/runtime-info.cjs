'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { RUNTIME } = require('./paths.cjs');
const standalone = process.env.COMPANION_STANDALONE === '1' || process.platform !== 'linux';
function runtimeInfo() {
  if (standalone) return { canLaunchCodex: false, version: null, standalone: true };
  const metadata = JSON.parse(fs.readFileSync(path.join(RUNTIME, 'source.json'), 'utf8'));
  return { canLaunchCodex: true, version: metadata.version, standalone: false };
}
module.exports = { standalone, runtimeInfo };
