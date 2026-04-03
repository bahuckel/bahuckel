#!/usr/bin/env node
/**
 * Nuke all avatars: clear avatarUrl from users.json and delete avatar files.
 * Run from project root: node scripts/nuke-avatars.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

// Nuke ALL known data locations (dev server, Server GUI package, etc.)
const candidates = [
  path.join(root, 'data'),
  path.join(root, 'server', 'data'),
  path.join(root, 'release', 'server-gui-build', 'win-unpacked', 'resources', 'data'),
];
if (process.env.BAHUCKEL_DATA_DIR) candidates.unshift(process.env.BAHUCKEL_DATA_DIR);

const dataDirs = [];
for (const d of candidates) {
  const resolved = path.resolve(d);
  if (fs.existsSync(path.join(resolved, 'users.json'))) {
    dataDirs.push(resolved);
  }
}
if (dataDirs.length === 0) {
  console.error('Could not find users.json. Tried:', candidates);
  process.exit(1);
}

for (const dataDir of dataDirs) {
  console.log('Nuking:', dataDir);
  const usersPath = path.join(dataDir, 'users.json');
  const avatarsDir = path.join(dataDir, 'avatars');

  const raw = fs.readFileSync(usersPath, 'utf-8');
  const data = JSON.parse(raw);
  let changed = false;
  if (data.users && Array.isArray(data.users)) {
    for (const u of data.users) {
      if (u.avatarUrl) {
        delete u.avatarUrl;
        changed = true;
      }
    }
  }
  if (changed) {
    fs.writeFileSync(usersPath, JSON.stringify(data, null, 0), 'utf-8');
    console.log('  Cleared avatarUrl from', data.users.length, 'users');
  }

  if (fs.existsSync(avatarsDir)) {
    const files = fs.readdirSync(avatarsDir);
    for (const f of files) {
      fs.unlinkSync(path.join(avatarsDir, f));
    }
    console.log('  Deleted', files.length, 'avatar files');
  }
}
console.log('Done. Restart the server.');
