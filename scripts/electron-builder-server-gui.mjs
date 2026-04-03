/**
 * Runs electron-builder for server-gui with extraResources that match what
 * build-server-exe.mjs actually produced (OSS builds omit marketing exe + public-website).
 * Restores server-gui/package.json after the run so the repo file stays unchanged.
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const serverGuiPkgPath = path.join(root, 'server-gui', 'package.json');
const releaseDir = path.join(root, 'release');

const raw = fs.readFileSync(serverGuiPkgPath, 'utf8');
const pkg = JSON.parse(raw);

const base = [
  { from: '../release/bahuckel-server.exe', to: 'bahuckel-server.exe' },
  { from: '../release/sql-wasm.wasm', to: 'sql-wasm.wasm' },
  { from: '../release/public', to: 'public' },
];

const websiteExe = path.join(releaseDir, 'bahuckel-website.exe');
const publicWebsite = path.join(releaseDir, 'public-website');
const hasMarketing =
  fs.existsSync(websiteExe) &&
  fs.existsSync(publicWebsite) &&
  fs.statSync(publicWebsite).isDirectory();

const optional = hasMarketing
  ? [
      { from: '../release/bahuckel-website.exe', to: 'bahuckel-website.exe' },
      { from: '../release/public-website', to: 'public-website' },
    ]
  : [];

pkg.build.extraResources = [...base, ...optional];
fs.writeFileSync(serverGuiPkgPath, JSON.stringify(pkg, null, 2) + '\n');

if (optional.length === 0) {
  console.log('server-gui pack: optional marketing resources omitted (no bahuckel-website.exe + public-website/).');
} else {
  console.log('server-gui pack: including marketing exe and public-website/.');
}

let exitCode = 1;
try {
  const r = spawnSync('npx', ['electron-builder', '--project=server-gui'], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });
  exitCode = r.status ?? 1;
} finally {
  fs.writeFileSync(serverGuiPkgPath, raw);
}

process.exit(exitCode);
