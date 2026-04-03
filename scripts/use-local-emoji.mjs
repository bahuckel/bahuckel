/**
 * Sync emoji assets and build the single source list from client/public/emoji.
 * 1) If release/public/emoji exists → copy all PNGs to client/public/emoji.
 * 2) Read client/public/emoji/*.png and write client/src/emojiLocalAssets.json.
 * Run: npm run use-local-emoji (from repo root).
 * Your 3404 PNGs can live in release/public/emoji or directly in client/public/emoji.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const sourceDir = path.join(root, 'release', 'public', 'emoji');
const targetDir = path.join(root, 'client', 'public', 'emoji');
const listPath = path.join(root, 'client', 'src', 'emojiLocalAssets.json');

if (fs.existsSync(sourceDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
  const files = fs.readdirSync(sourceDir).filter((f) => f.endsWith('.png'));
  let copied = 0;
  for (const f of files) {
    fs.copyFileSync(path.join(sourceDir, f), path.join(targetDir, f));
    copied++;
  }
  console.log('Copied', copied, 'PNGs from release/public/emoji to client/public/emoji');
}

if (!fs.existsSync(targetDir)) {
  console.error('No client/public/emoji folder. Create it and add PNGs (e.g. copy from release/public/emoji), then run this script.');
  process.exit(1);
}

const pngs = fs.readdirSync(targetDir).filter((f) => f.endsWith('.png'));
const codepoints = pngs.map((f) => f.slice(0, -4)).sort();
fs.writeFileSync(listPath, JSON.stringify(codepoints), 'utf8');
console.log('Wrote', codepoints.length, 'codepoints to client/src/emojiLocalAssets.json');
console.log('Run npm run build; emojis load from /emoji/ at runtime. NO Unicode.');
