/**
 * Copy client/dist to release/public so the server exe serves the latest client.
 * Run after a successful "npm run build".
 * Use when: You ran build successfully and need to update what Bahuckel Server serves.
 *
 * Bahuckel.exe loads from the server URL; the server serves release/public.
 * For server-gui-build: run "npm run build:server-gui" after this to repackage.
 *
 * Voice sounds: put files in client/public/sounds/ (e.g. voice-join.mp3). Vite copies
 * public/ into dist/, so they ship with every build. This script used to wipe
 * release/public entirely; we merge any extra files that existed only under
 * release/public/sounds/ so one-off drops there are not lost (new dist wins on name clash).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const clientDist = path.join(root, 'client', 'dist');
const releasePublic = path.join(root, 'release', 'public');

if (!fs.existsSync(clientDist) || !fs.existsSync(path.join(clientDist, 'index.html'))) {
  console.error('client/dist not found or empty. Run "npm run build" first.');
  process.exit(1);
}

/** Copy files from mergeFrom into mergeInto only where mergeInto does not already have that path (recursive). */
function mergeMissingFiles(mergeFrom, mergeInto) {
  if (!fs.existsSync(mergeFrom)) return;
  fs.mkdirSync(mergeInto, { recursive: true });
  for (const name of fs.readdirSync(mergeFrom, { withFileTypes: true })) {
    const fromPath = path.join(mergeFrom, name.name);
    const toPath = path.join(mergeInto, name.name);
    if (name.isDirectory()) {
      mergeMissingFiles(fromPath, toPath);
    } else if (!fs.existsSync(toPath)) {
      fs.copyFileSync(fromPath, toPath);
    }
  }
}

const tmpSounds = path.join(root, 'release', '.sounds-merge-tmp');
const previousSounds = path.join(releasePublic, 'sounds');
if (fs.existsSync(previousSounds)) {
  fs.rmSync(tmpSounds, { recursive: true, force: true });
  fs.cpSync(previousSounds, tmpSounds, { recursive: true });
}

// Wipe release/public first so old hashed assets don't linger (Electron/server may cache)
if (fs.existsSync(releasePublic)) {
  fs.rmSync(releasePublic, { recursive: true });
}
fs.mkdirSync(releasePublic, { recursive: true });
fs.cpSync(clientDist, releasePublic, { recursive: true });

// Restore sound files that were only in release/public/sounds (not in client/public → dist)
if (fs.existsSync(tmpSounds)) {
  mergeMissingFiles(tmpSounds, path.join(releasePublic, 'sounds'));
  fs.rmSync(tmpSounds, { recursive: true, force: true });
}

// Always sync from client/public/sounds last so voice files are never dropped and match source of truth
const clientPublicSounds = path.join(root, 'client', 'public', 'sounds');
const releaseSounds = path.join(releasePublic, 'sounds');
if (fs.existsSync(clientPublicSounds)) {
  fs.mkdirSync(releaseSounds, { recursive: true });
  fs.cpSync(clientPublicSounds, releaseSounds, { recursive: true, force: true });
}

console.log('Copied client/dist to release/public');
console.log('');
console.log('To see changes:');
console.log('  - Bahuckel.exe (client): Run "npm run build:client-exe". Use release/builder-out/win-unpacked/Bahuckel.exe');
console.log('  - Standalone server (bahuckel-server.exe): Restart it. Serves from release/public/.');
console.log('  - Server GUI (browser to localhost): Run "npm run build:server-gui", then run the new Server exe.');
