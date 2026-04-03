const { app, BrowserWindow, ipcMain, Menu, desktopCapturer, session, globalShortcut, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { pathToFileURL } = require('url');

/**
 * Packaged app used to load the UI with loadFile → file://…/index.html.
 * Remote WebRTC audio on <audio>.srcObject often does not play on file:// (decode/stats OK, media-playout ~0).
 * Dev still uses loadURL(serverUrl) like a browser — that path works.
 * Serve the same bundled client over a privileged app:// origin so playback matches the browser.
 */
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

function registerPackagedClientProtocol() {
  const distRoot = path.join(__dirname, 'client', 'dist');
  const distResolved = path.resolve(distRoot);
  protocol.handle('app', (request) => {
    try {
      const u = new URL(request.url);
      let pathname = u.pathname;
      if (pathname === '/' || pathname === '') pathname = '/index.html';
      const decoded = decodeURIComponent(pathname);
      const relative = path.normalize(decoded).replace(/^[/\\]+/, '');
      if (relative.includes('..')) {
        return new Response('Bad path', { status: 400 });
      }
      const candidate = path.join(distRoot, relative);
      const candidateResolved = path.resolve(candidate);
      const rel = path.relative(distResolved, candidateResolved);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        return new Response('Forbidden', { status: 403 });
      }
      if (!fs.existsSync(candidateResolved) || fs.statSync(candidateResolved).isDirectory()) {
        return new Response('Not Found', { status: 404 });
      }
      return net.fetch(pathToFileURL(candidateResolved).href);
    } catch (e) {
      return new Response(String(e), { status: 500 });
    }
  });
}

const CONFIG_FILENAME = 'bahuckel-server.json';

function getConfigPath() {
  return path.join(app.getPath('userData'), CONFIG_FILENAME);
}

/** One-time: copy server list from next to .exe (old builds) into userData so rebuilds keep your servers. */
function migrateConfigFromLegacyExeDir() {
  if (!app.isPackaged) return;
  try {
    const legacy = path.join(path.dirname(process.execPath), CONFIG_FILENAME);
    const dest = getConfigPath();
    if (!fs.existsSync(legacy)) return;
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(legacy, dest);
      return;
    }
    const stL = fs.statSync(legacy);
    const stD = fs.statSync(dest);
    if (stL.mtimeMs > stD.mtimeMs && stL.size > 2) {
      fs.copyFileSync(legacy, dest);
    }
  } catch (_) {}
}

function normalizeUrl(url) {
  const u = String(url).trim().replace(/\/$/, '');
  return u.startsWith('http') ? u : 'http://' + u;
}

function getConfig() {
  try {
    const p = getConfigPath();
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (data && typeof data === 'object') {
        if (typeof data.serverUrl === 'string' && data.serverUrl.trim()) {
          const url = normalizeUrl(data.serverUrl);
          const migrated = {
            servers: [{ id: '1', name: 'Server', url }],
            lastUsedUrl: url,
          };
          fs.writeFileSync(p, JSON.stringify(migrated, null, 2), 'utf8');
          return migrated;
        }
        const servers = Array.isArray(data.servers) ? data.servers : [];
        const list = servers
          .filter((s) => s && typeof s.id === 'string' && typeof s.url === 'string')
          .map((s) => ({ id: s.id, name: typeof s.name === 'string' ? s.name : 'Server', url: normalizeUrl(s.url) }));
        return {
          servers: list,
          lastUsedUrl: typeof data.lastUsedUrl === 'string' && data.lastUsedUrl.trim() ? normalizeUrl(data.lastUsedUrl) : null,
        };
      }
    }
  } catch (_) {}
  return { servers: [], lastUsedUrl: null };
}

function saveConfig(config) {
  const p = getConfigPath();
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(config, null, 2), 'utf8');
}

function checkServerHealth(url) {
  return new Promise((resolve) => {
    const base = String(url).trim().replace(/\/$/, '');
    const healthUrl = base + '/health';
    let parsed;
    try {
      parsed = new URL(healthUrl);
    } catch {
      resolve(false);
      return;
    }
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.get(healthUrl, { timeout: 5000 }, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 300);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

let mainWindow = null;
let setupWindow = null;
let serverOfflineWindow = null;
let exitingToServerSelect = false;
let showingServerOfflineFrom502 = false;

const iconPath = path.join(__dirname, 'bahuckel.ico');

function createServerOfflineWindow() {
  const win = new BrowserWindow({
    width: 480,
    height: 340,
    title: 'Bahuckel',
    icon: iconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'server-offline.html'));
  win.on('closed', () => {
    serverOfflineWindow = null;
    if (mainWindow === null && setupWindow === null) app.quit();
  });
  serverOfflineWindow = win;
  return win;
}

function createSetupWindow() {
  const setup = new BrowserWindow({
    width: 520,
    height: 420,
    title: 'Bahuckel – Select server',
    icon: iconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  setup.setMenuBarVisibility(false);
  setup.loadFile(path.join(__dirname, 'setup.html'));
  setup.on('closed', () => {
    setupWindow = null;
    if (mainWindow === null && !exitingToServerSelect) app.quit();
  });
  return setup;
}

function createMainWindow(serverUrl) {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Bahuckel',
    icon: iconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload-main.cjs'),
      webSecurity: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  win._serverUrl = serverUrl;
  win.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media' || permission === 'display-capture' || permission === 'fullscreen');
  });
  win.webContents.on('before-input-event', (_, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') win.webContents.toggleDevTools();
  });
  if (!app.isPackaged) win.webContents.openDevTools({ mode: 'detach' });

  // Packaged: bundled client must NOT be file:// — remote voice <audio> playout breaks; use app:// (see registerPackagedClientProtocol).
  const clientHtml = path.join(__dirname, 'client', 'dist', 'index.html');
  if (app.isPackaged && fs.existsSync(clientHtml)) {
    const bundleUrl = new URL('app://bundle/index.html');
    bundleUrl.searchParams.set('server', serverUrl);
    win.loadURL(bundleUrl.toString());
  } else {
    win.loadURL(serverUrl);
  }
  win.webContents.once('did-finish-load', () => {
    win.webContents.executeJavaScript(
      "document.title.includes('502') || document.title.toLowerCase().includes('bad gateway') || document.body?.innerText?.includes('Bad gateway')"
    ).then((isErrorPage) => {
      if (isErrorPage && mainWindow === win && serverOfflineWindow === null) {
        showingServerOfflineFrom502 = true;
        mainWindow = null;
        win.close();
        createServerOfflineWindow();
      }
    }).catch(() => {});
  });
  win.on('enter-full-screen', () => {
    try { win.webContents.send('window-fullscreen-change', true); } catch (_) {}
  });
  win.on('leave-full-screen', () => {
    try { win.webContents.send('window-fullscreen-change', false); } catch (_) {}
  });
  win.on('closed', () => {
    mainWindow = null;
    if (showingServerOfflineFrom502) {
      showingServerOfflineFrom502 = false;
      return;
    }
    if (exitingToServerSelect) {
      exitingToServerSelect = false;
      setupWindow = createSetupWindow();
    } else {
      app.quit();
    }
  });
  return win;
}

ipcMain.handle('get-config', () => getConfig());

/** Sync URL for API/avatar when client is app:// or file:// + ?server= (query can be lost after history.replaceState). */
ipcMain.on('get-server-url-sync', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const url = win && win._serverUrl ? String(win._serverUrl).trim().replace(/\/$/, '') : '';
  event.returnValue = url;
});

ipcMain.on('picker-log', (_e, data) => {
  if (pickerLogMainWin && !pickerLogMainWin.isDestroyed()) {
    pickerLogMainWin.webContents.send('picker-log', data);
  }
});

// Screen share: setDisplayMediaRequestHandler so getDisplayMedia() works
// Picker has NO parent – standalone window. Closing a child was likely corrupting main window (white screen)
let pickerLogMainWin = null;
function setupDisplayMediaHandler() {
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 150, height: 150 } });
      if (sources.length === 0) {
        callback({});
        return;
      }
      const mainWin = BrowserWindow.fromWebContents(request.webContents);
      pickerLogMainWin = mainWin;
      const payload = sources.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.id.startsWith('screen:') ? 'screen' : 'window',
        thumbnail: s.thumbnail.toDataURL(),
      }));
      const picker = new BrowserWindow({
        width: 420,
        height: 420,
        title: 'Share screen',
        alwaysOnTop: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          preload: path.join(__dirname, 'preload-picker.cjs'),
        },
      });
      picker.setMenuBarVisibility(false);
      picker.loadFile(path.join(__dirname, 'screen-share-picker.html'));
      picker.webContents.once('did-finish-load', () => {
        picker.webContents.send('screen-share-sources', payload);
      });
      picker.once('ready-to-show', () => {
        picker.show();
        picker.focus();
        picker.setAlwaysOnTop(true);
        picker.moveTop();
        [100, 250, 400].forEach((ms) => setTimeout(() => { try { picker.focus(); picker.moveTop(); } catch (_) {} }, ms));
      });
      const sourceId = await new Promise((resolve) => {
        const onSelected = (_e, id) => {
          ipcMain.removeListener('screen-share-selected', onSelected);
          resolve(id);
          setTimeout(() => { try { picker.close(); } catch (_) {} }, 100);
        };
        ipcMain.on('screen-share-selected', onSelected);
        picker.on('closed', () => {
          ipcMain.removeListener('screen-share-selected', onSelected);
          pickerLogMainWin = null;
          resolve(null);
        });
      });
      const src = sourceId ? sources.find((s) => s.id === sourceId) : null;
      if (mainWin && !mainWin.isDestroyed()) mainWin.focus();
      try {
        callback(src ? { video: src } : {});
      } catch (e) {
        console.warn('Screen share callback error:', e);
      }
    } catch (err) {
      console.warn('Screen share handler error:', err);
      try { callback({}); } catch (_) {}
    }
  }, { useSystemPicker: false });
}

// Fallback: IPC picker for getUserMedia flow (if setDisplayMediaRequestHandler doesn't work)
ipcMain.handle('request-screen-share', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return null;
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 150, height: 150 } });
    if (sources.length === 0) return null;
    const payload = sources.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.id.startsWith('screen:') ? 'screen' : 'window',
      thumbnail: s.thumbnail.toDataURL(),
    }));
    const picker = new BrowserWindow({
      width: 420,
      height: 420,
      title: 'Share screen',
      parent: win,
      modal: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload-picker.cjs'),
      },
    });
    picker.setMenuBarVisibility(false);
    picker.loadFile(path.join(__dirname, 'screen-share-picker.html'));
    picker.webContents.once('did-finish-load', () => {
      picker.webContents.send('screen-share-sources', payload);
    });
    return new Promise((resolve) => {
      const onSelected = (_e, sourceId) => {
        ipcMain.removeListener('screen-share-selected', onSelected);
        const src = sources.find((s) => s.id === sourceId);
        resolve(src ? src.id : null);
        setTimeout(() => picker.close(), 50);
      };
      ipcMain.on('screen-share-selected', onSelected);
      picker.on('closed', () => {
        ipcMain.removeListener('screen-share-selected', onSelected);
        resolve(null);
      });
    });
  } catch (err) {
    console.warn('Screen share picker error:', err);
    return null;
  }
});

ipcMain.handle('add-server', (_event, name, url) => {
  const config = getConfig();
  const id = String(Date.now());
  const normalized = normalizeUrl(url);
  config.servers.push({ id, name: String(name).trim() || 'Server', url: normalized });
  saveConfig(config);
  return getConfig();
});

ipcMain.handle('remove-server', (_event, id) => {
  const config = getConfig();
  config.servers = config.servers.filter((s) => s.id !== id);
  if (config.lastUsedUrl && !config.servers.some((s) => s.url === config.lastUsedUrl)) config.lastUsedUrl = null;
  saveConfig(config);
  return getConfig();
});

function getSecureOriginList() {
  const urls = new Set();
  const add = (u) => {
    if (u) {
      try {
        const origin = new URL(normalizeUrl(u)).origin;
        if (origin.startsWith('http://')) urls.add(origin);
      } catch (_) {}
    }
  };
  [3000, 3001, 5000, 5173, 8080].forEach((p) => {
    add(`http://localhost:${p}`);
    add(`http://127.0.0.1:${p}`);
  });
  add(process.env.BAHUCKEL_SERVER_URL);
  const config = getConfig();
  add(config.lastUsedUrl);
  (config.servers || []).forEach((s) => add(s.url));
  return urls;
}

ipcMain.handle('connect-to-server', (_event, url) => {
  const normalized = normalizeUrl(url);
  const config = getConfig();
  config.lastUsedUrl = normalized;
  saveConfig(config);
  const origins = getSecureOriginList();
  if (origins.size > 0) {
    app.commandLine.appendSwitch('unsafely-treat-insecure-origin-as-secure', [...origins].join(','));
  }
  if (setupWindow) {
    setupWindow.close();
    setupWindow = null;
  }
  mainWindow = createMainWindow(normalized);
  return normalized;
});

ipcMain.on('exit-to-server-select', () => {
  exitingToServerSelect = true;
  if (mainWindow) mainWindow.close();
});

ipcMain.on('exit-fullscreen', () => {
  const win = mainWindow || BrowserWindow.getFocusedWindow();
  if (win?.isFullScreen?.()) {
    win.setFullScreen(false);
  } else {
    win?.webContents?.executeJavaScript(
      "try{(document.exitFullscreen||document.webkitExitFullscreen)?.();}catch(e){}"
    );
  }
});

ipcMain.on('set-window-fullscreen', (_e, value) => {
  const win = mainWindow || BrowserWindow.fromWebContents(_e.sender);
  if (win && !win.isDestroyed()) win.setFullScreen(!!value);
});

ipcMain.on('server-offline-goto-select', () => {
  if (serverOfflineWindow) {
    serverOfflineWindow.close();
    serverOfflineWindow = null;
  }
  setupWindow = createSetupWindow();
});

ipcMain.on('server-offline-quit', () => {
  app.quit();
});

// Before app.ready: treat server origin(s) as secure so navigator.mediaDevices exists (needed for screen share)
(function () {
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
  const origins = getSecureOriginList();
  if (origins.size > 0) {
    app.commandLine.appendSwitch('unsafely-treat-insecure-origin-as-secure', [...origins].join(','));
  }
})();

app.whenReady().then(async () => {
  migrateConfigFromLegacyExeDir();
  if (app.isPackaged) {
    registerPackagedClientProtocol();
  }
  Menu.setApplicationMenu(null);
  setupDisplayMediaHandler();
  const config = getConfig();
  const url = process.env.BAHUCKEL_SERVER_URL || config.lastUsedUrl;
  const normalized = url ? normalizeUrl(url) : null;
  if (normalized) {
    const isUp = await checkServerHealth(normalized);
    if (isUp) {
      mainWindow = createMainWindow(normalized);
    } else {
      createServerOfflineWindow();
    }
  } else {
    setupWindow = createSetupWindow();
  }
});

app.on('window-all-closed', () => app.quit());
