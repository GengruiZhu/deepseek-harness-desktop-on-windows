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
// 顶栏配色：页面背景是主题（浅色/深色）说了算，主进程据此把窗口那条也刷成同色，
// 否则系统按钮所在的区域会和界面分成两块（就是「拼贴感」的来源）。
contextBridge.exposeInMainWorld('dshShell', {
  titlebar: (color) => ipcRenderer.send('dsh-titlebar-color', color)
});
