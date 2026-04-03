/**
 * Copy website/dist → release/public-website for bahuckel-website.exe (port 8080).
 * Run after: npm run build:website
 * The website exe looks for public-website next to itself, not the repo's website/dist folder.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const src = path.join(root, 'website', 'dist');
const dest = path.join(root, 'release', 'public-website');

if (!fs.existsSync(path.join(src, 'index.html'))) {
  console.error('website/dist not found. Run: npm run build:website');
  process.exit(1);
}

fs.mkdirSync(dest, { recursive: true });
fs.cpSync(src, dest, { recursive: true });
console.log('Copied marketing site to', dest);
console.log('Restart bahuckel-website.exe (or start-website.bat), then open http://127.0.0.1:8080');
