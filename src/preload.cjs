'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const api = {};
for (const [name, channel] of Object.entries({
  read: 'read',
  save: 'save',
  preview: 'preview',
  launch: 'launch',
  restore: 'restore',
  reset: 'reset',
  undo: 'undo',
  copyTheme: 'copy-theme',
  pickPhoto: 'pick-photo',
  dropPhoto: 'drop-photo',
  saveLook: 'save-look',
  loadLook: 'load-look',
  deleteLook: 'delete-look',
  exportLook: 'export-look',
  importLook: 'import-look',
}))
  api[name] = (value) => ipcRenderer.invoke('appearance:' + channel, value);
api.onSettings = (fn) => ipcRenderer.on('appearance:changed', (_event, value) => fn(value));
api.close = () => ipcRenderer.send('appearance:close');
api.window = (action) => ipcRenderer.send('appearance:window', action);
contextBridge.exposeInMainWorld('companion', api);
