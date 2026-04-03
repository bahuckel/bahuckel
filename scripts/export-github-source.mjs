/**
 * Copy only files needed to build Bahuckel into github/source/ (no node_modules, dist, release, etc.).
 * Run: node scripts/export-github-source.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'github', 'source');

/** Directory names to exclude anywhere in the path */
const SKIP_DIR_NAMES = new Set([
  'node_modules',
  'dist',
  'dist-pkg',
  '.git',
  '.cursor',
  '.turbo',
  'coverage',
  'release',
  'builder-out',
  'server-gui-build',
  'github', // avoid nesting previous export
  'website', // marketing site — not part of the open-source upload
]);

/** Skip runtime / secret paths */
function shouldSkipRel(rel) {
  const norm = rel.split(path.sep).join('/');
  const parts = rel.split(path.sep).filter(Boolean);
  for (const p of parts) {
    if (SKIP_DIR_NAMES.has(p)) return true;
  }
  if (norm.startsWith('server/data') || norm.includes('/server/data')) return true;
  if (norm.startsWith('server/certs') || norm.includes('/server/certs')) return true;
  return false;
}

const SKIP_FILES = new Set([
  'server/giphy-api-key.txt',
  'server/giphy-api-key',
  '.env',
  '.env.local',
]);

function shouldSkipFile(rel) {
  const norm = rel.split(path.sep).join('/');
  if (SKIP_FILES.has(norm)) return true;
  if (norm.endsWith('.pem')) return true;
  if (norm.endsWith('.sqlite') || norm.endsWith('.sqlite-wal')) return true;
  if (/^bahuckel-webrtc-diagnostics-.*\.json$/i.test(path.basename(norm))) return true;
  return false;
}

function rmrf(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function walkCopy(fromRoot, currentRel) {
  const full = path.join(fromRoot, currentRel);
  let stat;
  try {
    stat = fs.statSync(full);
  } catch {
    return;
  }
  if (stat.isDirectory()) {
    if (currentRel && shouldSkipRel(currentRel)) return;
    const names = fs.readdirSync(full);
    for (const name of names) {
      const rel = currentRel ? path.join(currentRel, name) : name;
      if (shouldSkipRel(rel)) continue;
      walkCopy(fromRoot, rel);
    }
  } else if (stat.isFile()) {
    if (shouldSkipRel(currentRel) || shouldSkipFile(currentRel)) return;
    const dest = path.join(outDir, currentRel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(full, dest);
  }
}

console.log('Exporting source to', outDir);
rmrf(outDir);
fs.mkdirSync(outDir, { recursive: true });
walkCopy(root, '');

const countFiles = (dir) => {
  let n = 0;
  const walk = (d) => {
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      if (fs.statSync(p).isDirectory()) walk(p);
      else n += 1;
    }
  };
  walk(dir);
  return n;
};
console.log('Done.', countFiles(outDir), 'files copied.');
console.log('Next: see github/README.md');
