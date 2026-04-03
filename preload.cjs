const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bahuckel', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  addServer: (name, url) => ipcRenderer.invoke('add-server', name, url),
  removeServer: (id) => ipcRenderer.invoke('remove-server', id),
  connectToServer: (url) => ipcRenderer.invoke('connect-to-server', url),
  gotoServerSelect: () => ipcRenderer.send('server-offline-goto-select'),
  quitApp: () => ipcRenderer.send('server-offline-quit'),
});
