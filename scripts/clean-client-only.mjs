/**
 * Remove only client/electron build artifacts from release/.
 * Preserves: bahuckel-server.exe, public/, data/, start-server.bat
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const releaseDir = path.join(__dirname, '..', 'release');

if (!fs.existsSync(releaseDir)) {
  console.log('release/ does not exist, nothing to clean');
  process.exit(0);
}

const toRemove = [
  path.join(releaseDir, 'win-unpacked'),
  path.join(releaseDir, 'builder-debug.yml'),
  path.join(releaseDir, 'builder-effective-config.yaml'),
];

// Remove portable exe and zip (client artifacts)
const entries = fs.readdirSync(releaseDir, { withFileTypes: true });
for (const e of entries) {
  const p = path.join(releaseDir, e.name);
  if (e.isFile() && ((e.name.endsWith('.exe') && !e.name.includes('server')) || e.name.endsWith('.zip'))) {
    toRemove.push(p);
  }
}

let removed = 0;
for (const p of toRemove) {
  if (fs.existsSync(p)) {
    fs.rmSync(p, { recursive: true, force: true });
    console.log('Removed:', path.relative(releaseDir, p) || p);
    removed++;
  }
}

if (removed === 0) {
  console.log('No client artifacts to remove');
} else {
  console.log('Cleaned. Server files (bahuckel-server.exe, public/, data/, start-server.bat) preserved.');
}
