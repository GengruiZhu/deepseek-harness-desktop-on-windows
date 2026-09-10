const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('dshSetup', {
  submit: (key) => ipcRenderer.send('dsh-set-api-key', key)
});
contextBridge.exposeInMainWorld('dshBoot', {
  retry: () => ipcRenderer.send('dsh-boot-action', 'retry'),
  quit: () => ipcRenderer.send('dsh-boot-action', 'quit')
});
// Chat 面板专用：只读回内嵌网页的可见文字（由主进程限定只能读 chat.deepseek.com 那个 guest）。
contextBridge.exposeInMainWorld('dshChat', {
  read: () => ipcRenderer.invoke('dsh-chat-read')
});
