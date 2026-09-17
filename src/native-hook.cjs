'use strict';
// Installed in the owned Codex process before its application entry executes.
// The signed application remains byte-for-byte unchanged on disk.
function install() {
  if (global.__companionNativeInstalled) return true;
  const Module = require('node:module');
  const electron = require('electron');
  const { StyledWindow } = require('./codex-hook.cjs');
  const facade = Object.create(electron);
  Object.defineProperty(facade, 'BrowserWindow', { value: StyledWindow, enumerable: true });
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'electron' || request === 'electron/main') return facade;
    return originalLoad.call(this, request, parent, isMain);
  };
  global.__companionNativeInstalled = true;
  return true;
}
module.exports = { install };
