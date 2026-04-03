/**
 * Download Twemoji 72x72 PNGs for each codepoint in the allowlist into client/public/emoji/.
 * Run once: npm run download-emoji-assets (or with --limit 800 for a quicker first run).
 * Free assets from https://github.com/twitter/twemoji (CC-BY 4.0).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const assetsListPath = path.join(root, 'client', 'src', 'emojiLocalAssets.json');
const outDir = path.join(root, 'client', 'public', 'emoji');
const CDN = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72';

const limit = process.argv.includes('--limit')
  ? parseInt(process.argv[process.argv.indexOf('--limit') + 1], 10)
  : 0;

// Prefer allowlist from existing local assets; otherwise no CDN download (run use-local-emoji to copy from release/public/emoji)
let codepoints = [];
if (fs.existsSync(outDir)) {
  codepoints = fs.readdirSync(outDir).filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4));
}
if (fs.existsSync(assetsListPath)) {
  const existing = JSON.parse(fs.readFileSync(assetsListPath, 'utf8'));
  if (Array.isArray(existing) && existing.length > 0) codepoints = existing;
}
if (codepoints.length === 0) {
  console.error('No emoji list: ensure client/public/emoji has PNGs or run npm run use-local-emoji to copy from release/public/emoji.');
  process.exit(1);
}
// Country flags (regional indicator pairs) first so they're never skipped by --limit
const isFlag = (cp) => /^1f1e[6-9a-f]-1f1e[6-9a-f]$/.test(cp);
const ordered = [...codepoints.filter(isFlag), ...codepoints.filter((cp) => !isFlag(cp))];
const toFetch = limit > 0 ? ordered.slice(0, limit) : ordered;

fs.mkdirSync(outDir, { recursive: true });

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

let ok = 0;
let skip = 0;
let fail = 0;

for (const cp of toFetch) {
  if (!cp || typeof cp !== 'string') continue;
  const outFile = path.join(outDir, `${cp}.png`);
  if (fs.existsSync(outFile)) {
    skip++;
    continue;
  }
  try {
    const res = await fetch(`${CDN}/${cp}.png`);
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(outFile, buf);
      ok++;
    } else {
      fail++;
    }
  } catch (e) {
    fail++;
  }
  await delay(40);
}

console.log('Downloaded:', ok, 'Skipped (existing):', skip, 'Failed/404:', fail);
console.log('Emoji assets in', outDir);

// Write list of codepoints we have (for picker to show only these)
const have = fs.existsSync(outDir)
  ? fs.readdirSync(outDir).filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4)).sort()
  : [];
fs.writeFileSync(assetsListPath, JSON.stringify(have), 'utf8');
console.log('Wrote', have.length, 'codepoints to', assetsListPath);
