const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('dshSetup', {
  submit: (key) => ipcRenderer.send('dsh-set-api-key', key)
});
