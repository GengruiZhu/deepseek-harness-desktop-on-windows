const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('dshSetup', {
  submit: (key) => ipcRenderer.send('dsh-set-api-key', key)
});
contextBridge.exposeInMainWorld('dshBoot', {
  retry: () => ipcRenderer.send('dsh-boot-action', 'retry'),
  quit: () => ipcRenderer.send('dsh-boot-action', 'quit')
});
