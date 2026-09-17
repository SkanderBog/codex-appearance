'use strict';
const { app } = require('electron');
// Native packages carry their own Electron and photo decoder runtimes.
if (app.isPackaged) process.env.COMPANION_PACKAGED = '1';
if (process.argv.includes('--self-test')) process.env.COMPANION_MODE = 'self-test';
process.env.COMPANION_STANDALONE = '1';
process.env.COMPANION_PYTHON ||= process.platform === 'win32' ? 'python' : 'python3';
require('../src/main.cjs');
