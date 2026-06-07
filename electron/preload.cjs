const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('cairn', {
  version: '0.2.0',
  platform: process.platform,
  electron: true
});
