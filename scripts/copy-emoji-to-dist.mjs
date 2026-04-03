/**
 * Copy client/public/emoji to client/dist/emoji so the built app can serve PNGs.
 * Run after client build (npm run build already invokes this).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const src = path.join(root, 'client', 'public', 'emoji');
const dest = path.join(root, 'client', 'dist', 'emoji');

if (!fs.existsSync(src)) {
  console.warn('copy-emoji-to-dist: client/public/emoji not found (run npm run use-local-emoji first)');
  process.exit(0);
}

const distDir = path.join(root, 'client', 'dist');
if (!fs.existsSync(distDir)) {
  console.warn('copy-emoji-to-dist: client/dist not found (run client build first)');
  process.exit(0);
}

fs.mkdirSync(dest, { recursive: true });
const files = fs.readdirSync(src).filter((f) => f.endsWith('.png'));
let copied = 0;
for (const f of files) {
  fs.copyFileSync(path.join(src, f), path.join(dest, f));
  copied++;
}
const codepoints = files.map((f) => f.slice(0, -4).toLowerCase()).sort();
fs.writeFileSync(path.join(dest, 'codepoints.json'), JSON.stringify(codepoints), 'utf8');
console.log('Copied', copied, 'emoji PNGs to client/dist/emoji and wrote codepoints.json');
