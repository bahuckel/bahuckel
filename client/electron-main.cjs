/**
 * Electron main process for Bahuckel desktop client.
 * Build the client first: npm run build
 * Then run: npx electron .
 * Or: npm run electron (if script is set)
 *
 * The app will load the built files from dist/ and connect to the server URL
 * set in the renderer (see Vite env or window.__SERVER_URL__).
 */
const { app, BrowserWindow, protocol } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Handle bahuckel://invite/CODE links (optional: set as default protocol handler)
  app.setAsDefaultProtocolClient('bahuckel');

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  if (isDev) {
    win.loadURL(process.env.VITE_DEV_URL || 'http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  // Open invite links in the same window
  win.webContents.setWindowOpenHandler(({ url }) => {
    const match = url.match(/bahuckel:\/\/invite\/([A-Za-z0-9]+)/);
    if (match) {
      win.webContents.send('invite-code', match[1]);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
