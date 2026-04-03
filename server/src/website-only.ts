/**
 * Standalone static server for release/public-website only.
 * Run bahuckel-website.exe next to public-website/ so chat restarts (bahuckel-server.exe) do not affect :8080.
 */
import express from 'express';
import { createServer as createHttpServer } from 'http';
import { existsSync } from 'fs';
import { join } from 'path';
import { APP_ROOT } from './root.js';

const host = '0.0.0.0';
const websitePort = Number(process.env.WEBSITE_PORT ?? 8080);
const websiteRoot = join(APP_ROOT, 'public-website');

if (!Number.isFinite(websitePort) || websitePort <= 0) {
  console.error('Set WEBSITE_PORT to a positive port (default 8080).');
  process.exit(1);
}

if (!existsSync(join(websiteRoot, 'index.html'))) {
  console.error('Missing public-website/index.html next to this program.');
  console.error('Expected:', websiteRoot);
  process.exit(1);
}

const wApp = express();
wApp.use(
  express.static(websiteRoot, {
    setHeaders: (res, p) => {
      const filePath = String(p);
      if (filePath.endsWith('index.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      }
    },
  }),
);
wApp.use((_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.sendFile(join(websiteRoot, 'index.html'));
});

const siteServer = createHttpServer(wApp);
siteServer.on('error', (err: NodeJS.ErrnoException) => {
  console.error(err.code === 'EADDRINUSE' ? `Port ${websitePort} already in use.` : err.message);
  process.exit(1);
});
siteServer.listen(websitePort, host, () => {
  console.log(`Marketing site at http://127.0.0.1:${websitePort} (WEBSITE_PORT)`);
});
