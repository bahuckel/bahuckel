const { contextBridge, ipcRenderer } = require('electron');

let sent = false;
contextBridge.exposeInMainWorld('bahuckelPicker', {
  sendSelected: (sourceId) => {
    if (sent) return;
    sent = true;
    ipcRenderer.send('screen-share-selected', sourceId);
  },
  logToMain: (type, message, detail) => {
    ipcRenderer.send('picker-log', { type, message, detail: detail || {} });
  },
  onSources: (cb) => {
    const fn = (_e, sources) => cb(sources);
    ipcRenderer.on('screen-share-sources', fn);
    return () => ipcRenderer.removeListener('screen-share-sources', fn);
  },
});
