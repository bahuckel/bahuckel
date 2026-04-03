/**
 * Copy sql.js WASM into release/ so electron-builder extraResources can pack it.
 * Tries hoisted root node_modules then server workspace (npm may not hoist sql.js).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const candidates = [
  path.join(root, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
  path.join(root, 'server', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
];
const dest = path.join(root, 'release', 'sql-wasm.wasm');

fs.mkdirSync(path.dirname(dest), { recursive: true });
for (const src of candidates) {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log('ensure-sql-wasm:', dest);
    process.exit(0);
  }
}
console.error('ensure-sql-wasm: sql-wasm.wasm not found. Tried:\n  ' + candidates.join('\n  '));
console.error('Run npm install from the repo root.');
process.exit(1);
