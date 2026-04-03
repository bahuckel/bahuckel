/**
 * Build client and copy to release/public so bahuckel-server.exe serves the latest client.
 * Run from project root: npm run refresh-client
 *
 * Flow: bahuckel-server.exe (from release/) serves release/public/*.
 * After client changes, run this to update release/public with the new build.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const clientDist = path.join(root, 'client', 'dist');
const releasePublic = path.join(root, 'release', 'public');

console.log('Building client...');
execSync('npm run build', { stdio: 'inherit', cwd: root });

if (!fs.existsSync(clientDist)) {
  console.error('client/dist not found after build');
  process.exit(1);
}

fs.mkdirSync(releasePublic, { recursive: true });
fs.cpSync(clientDist, releasePublic, { recursive: true });
console.log('Copied client/dist to release/public');
console.log('Restart bahuckel-server.exe to serve the updated client.');
