const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isDesktop: true,
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  focusWindow: () => ipcRenderer.send('window-focus'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  setUnreadCount: (count) => ipcRenderer.send('set-unread-count', count),
  onMaximizedChange: (callback) => {
    ipcRenderer.on('window-maximized-change', (_event, isMaximized) => callback(isMaximized));
  },
  onDeepLink: (callback) => {
    ipcRenderer.on('deep-link', (_event, url) => callback(url));
  },
});
