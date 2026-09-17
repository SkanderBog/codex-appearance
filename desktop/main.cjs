'use strict';
// Separate Electron process: no Codex installation or account is loaded.
process.env.COMPANION_STANDALONE = '1';
process.env.COMPANION_PYTHON ||= process.platform === 'win32' ? 'python' : 'python3';
require('../src/main.cjs');
