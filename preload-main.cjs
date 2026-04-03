const { contextBridge, ipcRenderer } = require('electron');

ipcRenderer.on('picker-log', (_e, data) => {
  try {
    if (typeof window.__onPickerLog === 'function') window.__onPickerLog(data);
  } catch (_) {}
});

contextBridge.exposeInMainWorld('bahuckel', {
  /** Base URL of the Bahuckel server (e.g. https://host:3001). Use for /api/avatar when page is file://. */
  getServerUrl: () => {
    try {
      return ipcRenderer.sendSync('get-server-url-sync') || '';
    } catch (_) {
      return '';
    }
  },
  exitToServerSelect: () => ipcRenderer.send('exit-to-server-select'),
  /** Exits fullscreen. Uses Electron window fullscreen when available. */
  exitFullscreen: () => ipcRenderer.send('exit-fullscreen'),
  /** Set Electron window fullscreen (true/false). Avoids Fullscreen API click issues. */
  setWindowFullscreen: (v) => ipcRenderer.send('set-window-fullscreen', !!v),
  /** Subscribe to window fullscreen state (e.g. user presses Esc to exit). */
  onWindowFullscreenChange: (cb) => {
    const fn = (_e, v) => { try { cb(!!v); } catch (_) {} };
    ipcRenderer.on('window-fullscreen-change', fn);
    return () => ipcRenderer.removeListener('window-fullscreen-change', fn);
  },
  /** Returns sourceId when user selects, null when cancelled. Use with getUserMedia(chromeMediaSourceId). */
  requestScreenShare: () => ipcRenderer.invoke('request-screen-share'),
});
