/**
 * Bahuckel Server GUI - wraps the server process and Cloudflared with a simple UI.
 */
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow = null;
let serverProcess = null;
let cloudflaredProcess = null;

const appDir = app.isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '..');
const resourcesDir = app.isPackaged ? path.join(appDir, 'resources') : path.join(__dirname, '..', 'release');
const serverExe = path.join(resourcesDir, 'bahuckel-server.exe');

function getOwnerConfigPath() {
  return path.join(app.getPath('userData'), 'owner-config.json');
}

function loadOwnerConfig() {
  try {
    const cfgPath = getOwnerConfigPath();
    if (fs.existsSync(cfgPath)) {
      const data = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      return {
        ownerUsername: data.ownerUsername || '',
        ownerPassword: data.ownerPassword || '',
        giphyApiKey: data.giphyApiKey || '',
      };
    }
  } catch (_) {}
  return { ownerUsername: '', ownerPassword: '', giphyApiKey: '' };
}

function saveOwnerConfig(creds) {
  try {
    fs.writeFileSync(
      getOwnerConfigPath(),
      JSON.stringify({
        ownerUsername: creds.ownerUsername || '',
        ownerPassword: creds.ownerPassword || '',
        giphyApiKey: creds.giphyApiKey || '',
      }),
      'utf-8',
    );
  } catch (_) {}
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    minWidth: 600,
    minHeight: 400,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
    backgroundColor: '#1e1f22',
    titleBarStyle: 'default',
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.on('closed', () => {
    mainWindow = null;
    if (serverProcess) {
      serverProcess.kill();
      serverProcess = null;
    }
    if (cloudflaredProcess) {
      cloudflaredProcess.kill();
      cloudflaredProcess = null;
    }
  });
}

function sendToRenderer(channel, ...args) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}

function startServer() {
  if (serverProcess) return;
  if (!fs.existsSync(serverExe)) {
    sendToRenderer('log', 'server', 'ERROR: bahuckel-server.exe not found at ' + serverExe + '\nRun npm run build:server-exe first.\n');
    return;
  }
  const owner = loadOwnerConfig();
  const env = { ...process.env, BAHUCKEL_SERVER_GUI: '1', WEBSITE_PORT: '0' };
  if (owner.ownerUsername && owner.ownerPassword) {
    env.BAHUCKEL_OWNER_USERNAME = owner.ownerUsername;
    env.BAHUCKEL_OWNER_PASSWORD = owner.ownerPassword;
  }
  if (owner.giphyApiKey) {
    env.GIPHY_API_KEY = owner.giphyApiKey;
  }
  serverProcess = spawn(serverExe, [], {
    cwd: resourcesDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  });
  serverProcess.stdout.on('data', (d) => sendToRenderer('log', 'server', d.toString()));
  serverProcess.stderr.on('data', (d) => sendToRenderer('log', 'server', d.toString()));
  serverProcess.on('close', (code) => {
    sendToRenderer('log', 'server', '\n[Process exited with code ' + code + ']\n');
    serverProcess = null;
    sendToRenderer('server-stopped');
  });
  sendToRenderer('log', 'server', '[Server started]\n');
  sendToRenderer('server-started');
}

function stopServer() {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
    sendToRenderer('log', 'server', '[Server stopped]\n');
  }
}

function findCloudflared() {
  const name = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
  const dirs = [
    resourcesDir,
    path.join(resourcesDir, '..'),
    appDir,
    path.join(appDir, '..'),
    path.join(__dirname, '..'),
  ];
  for (const d of dirs) {
    if (!d) continue;
    const p = path.join(d, name);
    if (fs.existsSync(p)) return p;
  }
  return name;
}

function startCloudflared() {
  if (cloudflaredProcess) return;
  const cfPath = findCloudflared();
  const args = ['tunnel', '--url', 'http://127.0.0.1:3001'];
  try {
    const opts = { stdio: ['ignore', 'pipe', 'pipe'] };
    if (cfPath.includes(path.sep)) {
      opts.cwd = path.dirname(cfPath);
    }
    cloudflaredProcess = spawn(cfPath, args, opts);
  const handleCloudflaredOutput = (text) => {
    sendToRenderer('log', 'cloudflared', text);
    const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
    if (match) sendToRenderer('cloudflared-tunnel-url', match[0]);
  };
  cloudflaredProcess.stdout.on('data', (d) => handleCloudflaredOutput(d.toString()));
  cloudflaredProcess.stderr.on('data', (d) => handleCloudflaredOutput(d.toString()));
  cloudflaredProcess.on('close', (code) => {
    sendToRenderer('log', 'cloudflared', '\n[Cloudflared exited with code ' + code + ']\n');
    cloudflaredProcess = null;
    sendToRenderer('cloudflared-tunnel-url', '');
  });
  cloudflaredProcess.on('error', (err) => {
    sendToRenderer('log', 'cloudflared', 'ERROR: ' + err.message + '\nPlace cloudflared.exe in the project folder or add it to PATH.\n');
    cloudflaredProcess = null;
  });
  sendToRenderer('log', 'cloudflared', '[Cloudflared tunnel started]\n');
  } catch (err) {
    sendToRenderer('log', 'cloudflared', 'ERROR: ' + err.message + '\nPlace cloudflared.exe in the project folder or add it to PATH.\n');
  }
}

function stopCloudflared() {
  if (cloudflaredProcess) {
    cloudflaredProcess.kill();
    cloudflaredProcess = null;
    sendToRenderer('log', 'cloudflared', '[Cloudflared stopped]\n');
    sendToRenderer('cloudflared-tunnel-url', '');
  }
}

app.whenReady().then(() => {
  createWindow();
  const owner = loadOwnerConfig();
  if (owner.ownerUsername && owner.ownerPassword) {
    startServer();
  }
});

app.on('window-all-closed', () => {
  stopServer();
  stopCloudflared();
  app.quit();
});

ipcMain.on('server-restart', (_, creds) => {
  if (creds) {
    const prev = loadOwnerConfig();
    const giphy = typeof creds.giphyApiKey === 'string' ? creds.giphyApiKey.trim() : '';
    saveOwnerConfig({
      ownerUsername: creds.ownerUsername || prev.ownerUsername,
      ownerPassword: creds.ownerPassword || prev.ownerPassword,
      giphyApiKey: giphy || prev.giphyApiKey,
    });
  }
  stopServer();
  setTimeout(startServer, 500);
});

ipcMain.handle('get-owner-config', () => loadOwnerConfig());

ipcMain.handle('get-startup-state', () => {
  const owner = loadOwnerConfig();
  return { ownerRequired: !(owner.ownerUsername && owner.ownerPassword) };
});

ipcMain.on('server-login-and-start', (_, creds) => {
  if (creds && creds.ownerUsername && creds.ownerPassword && creds.giphyApiKey) {
    saveOwnerConfig(creds);
    startServer();
  }
});

ipcMain.on('server-shutdown', () => {
  stopServer();
});

ipcMain.on('cloudflared-start', () => {
  startCloudflared();
});

ipcMain.on('cloudflared-stop', () => {
  stopCloudflared();
});

ipcMain.handle('open-public-site', () => {
  shell.openExternal('http://127.0.0.1:8080');
  return true;
});

ipcMain.handle('open-chat-app', () => {
  shell.openExternal('http://127.0.0.1:3001');
  return true;
});
