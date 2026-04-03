/**
 * Build server into a single .exe using Node.js Single Executable Application (SEA).
 * Requires Node 20+ and runs on Windows (produces a Windows exe from the current Node binary).
 */
import * as esbuild from 'esbuild';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { execSync, spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const serverSrc = path.join(root, 'server', 'src', 'index.ts');
const websiteOnlySrc = path.join(root, 'server', 'src', 'website-only.ts');
const outDir = path.join(root, 'server', 'dist-pkg');
const releaseDir = path.join(root, 'release');
const postjectCli = path.join(root, 'node_modules', 'postject', 'dist', 'cli.js');

if (!fs.existsSync(serverSrc)) {
  console.error('Server source not found:', serverSrc);
  process.exit(1);
}

const nodeVersion = parseInt(process.version.slice(1).split('.')[0], 10);
if (nodeVersion < 20) {
  console.error('build:server-exe requires Node 20+ (Single Executable Application support). Current:', process.version);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(releaseDir, { recursive: true });

// Build client so we can serve the web app at / (browser + Cloudflare tunnel).
// Skip when --skip-build: caller (e.g. npm run build) already did the full build.
const skipBuild = process.argv.includes('--skip-build');
const clientDir = path.join(root, 'client');
if (!skipBuild && fs.existsSync(path.join(clientDir, 'package.json'))) {
  console.log('Building client for web app at /...');
  execSync('npm run build', { stdio: 'inherit', cwd: root });
}

const esbuildSeaOpts = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: false,
  minify: true,
  keepNames: false,
  define: {
    'import.meta': '{}',
    'import.meta.url': 'undefined',
  },
};

if (!fs.existsSync(postjectCli)) {
  console.error('postject not found. Run: npm install');
  process.exit(1);
}

/**
 * @param {{ entry: string; entryPoints: string[]; bundleOut: string; seaBlob: string; seaConfigPath: string; exeName: string; banner: string }} spec
 */
function buildSeaExe(spec) {
  const outFile = path.join(outDir, spec.bundleOut);
  console.log('Bundling', spec.entry, '→', spec.bundleOut);
  esbuild.buildSync({
    entryPoints: spec.entryPoints,
    outfile: outFile,
    banner: { js: spec.banner },
    ...esbuildSeaOpts,
  });

  console.log('Building SEA:', spec.exeName);
  fs.writeFileSync(
    spec.seaConfigPath,
    JSON.stringify({ main: outFile, output: spec.seaBlob }, null, 2),
    'utf8'
  );
  execSync(`node --experimental-sea-config "${spec.seaConfigPath}"`, {
    stdio: 'inherit',
    cwd: root,
  });

  const exeOut = path.join(releaseDir, spec.exeName);
  const exeTemp = path.join(releaseDir, spec.exeName.replace('.exe', '-temp.exe'));

  try {
    if (fs.existsSync(exeTemp)) fs.unlinkSync(exeTemp);
    fs.copyFileSync(process.execPath, exeTemp);
  } catch (err) {
    if (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES') {
      console.error('\nError: Could not write to release folder (resource busy or locked).');
      console.error('Close running exes and File Explorer on release/ if needed.');
      process.exit(1);
    }
    throw err;
  }

  const postjectResult = spawnSync(
    process.execPath,
    [postjectCli, exeTemp, 'NODE_SEA_BLOB', spec.seaBlob, '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'],
    { cwd: root, encoding: 'utf8' }
  );
  const postjectOutput = (postjectResult.stdout || '') + (postjectResult.stderr || '');
  const filtered = postjectOutput.replace(/warning: The signature seems corrupted!\s*\n?/gi, '');
  if (filtered.trim()) process.stdout.write(filtered);
  if (postjectResult.status !== 0) {
    console.error('Postject failed for', spec.exeName);
    process.exit(postjectResult.status);
  }

  try {
    if (fs.existsSync(exeOut)) fs.unlinkSync(exeOut);
    fs.renameSync(exeTemp, exeOut);
  } catch (err) {
    if (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES') {
      console.warn('\nWarning: Could not replace ' + spec.exeName + ' (it may be running).');
      console.warn('New build is at', exeTemp);
    } else {
      throw err;
    }
  }
  console.log('Done:', exeOut);
}

buildSeaExe({
  entry: 'index.ts',
  entryPoints: [serverSrc],
  bundleOut: 'bundle.cjs',
  seaBlob: path.join(outDir, 'sea.blob'),
  seaConfigPath: path.join(outDir, 'sea-config.json'),
  exeName: 'bahuckel-server.exe',
  banner: '/* Bahuckel Server - SEA bundle */',
});

buildSeaExe({
  entry: 'website-only.ts',
  entryPoints: [websiteOnlySrc],
  bundleOut: 'bundle-website.cjs',
  seaBlob: path.join(outDir, 'sea-website.blob'),
  seaConfigPath: path.join(outDir, 'sea-config-website.json'),
  exeName: 'bahuckel-website.exe',
  banner: '/* Bahuckel marketing site - SEA bundle */',
});

// Optional: assign build/icon.ico to bahuckel-website.exe via shortcut Properties or a post-build rcedit step.

// Bundle web client so opening the server URL in a browser works (e.g. via Cloudflare tunnel).
const clientDist = path.join(root, 'client', 'dist');
const clientPublicEmoji = path.join(root, 'client', 'public', 'emoji');
const releasePublic = path.join(releaseDir, 'public');
if (fs.existsSync(clientDist)) {
  fs.cpSync(clientDist, releasePublic, { recursive: true });
  console.log('Copied client to', releasePublic);
} else {
  console.warn('client/dist not found. Build client first (npm run build in client/) so the server can serve the web app at /.');
}

const websiteDist = path.join(root, 'website', 'dist');
const releasePublicWebsite = path.join(releaseDir, 'public-website');
if (fs.existsSync(path.join(websiteDist, 'index.html'))) {
  fs.cpSync(websiteDist, releasePublicWebsite, { recursive: true });
  console.log('Copied marketing site to', releasePublicWebsite);
} else {
  console.warn('website/dist not found. Optional: npm run build:website (bahuckel.com landing page on port 8080).');
  fs.mkdirSync(releasePublicWebsite, { recursive: true });
  fs.writeFileSync(
    path.join(releasePublicWebsite, 'index.html'),
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Bahuckel</title><style>body{font-family:system-ui;background:#1e1f22;color:#b5bac1;padding:2rem;line-height:1.5}</style></head><body><p>Marketing site not built. From the repo root run <strong>npm run build:website</strong>, then rebuild the server GUI.</p><p><a href="http://127.0.0.1:3001/" style="color:#5865f2">Open chat (3001)</a></p></body></html>',
    'utf8'
  );
  console.log('Wrote placeholder', releasePublicWebsite);
}

// Ensure /emoji/* and /emoji/codepoints.json exist so the client can load PNGs and the codepoint list.
const releaseEmoji = path.join(releasePublic, 'emoji');
if (!fs.existsSync(releaseEmoji) && fs.existsSync(clientPublicEmoji)) {
  fs.mkdirSync(releaseEmoji, { recursive: true });
  const pngs = fs.readdirSync(clientPublicEmoji).filter((f) => f.endsWith('.png'));
  pngs.forEach((f) => fs.copyFileSync(path.join(clientPublicEmoji, f), path.join(releaseEmoji, f)));
  const codepoints = pngs.map((f) => f.slice(0, -4).toLowerCase()).sort();
  fs.writeFileSync(path.join(releaseEmoji, 'codepoints.json'), JSON.stringify(codepoints), 'utf8');
  console.log('Copied', pngs.length, 'emoji PNGs + codepoints.json to', releaseEmoji);
} else if (fs.existsSync(releaseEmoji)) {
  const codepointsPath = path.join(releaseEmoji, 'codepoints.json');
  if (!fs.existsSync(codepointsPath)) {
    const pngs = fs.readdirSync(releaseEmoji).filter((f) => f.endsWith('.png'));
    const codepoints = pngs.map((f) => f.slice(0, -4).toLowerCase()).sort();
    fs.writeFileSync(codepointsPath, JSON.stringify(codepoints), 'utf8');
    console.log('Wrote codepoints.json to', releaseEmoji);
  }
}

// Chat server only (WEBSITE_PORT=0); marketing runs via bahuckel-website.exe / start-website.bat
const startBatPath = path.join(releaseDir, 'start-server.bat');
fs.writeFileSync(
  startBatPath,
  '@echo off\r\n' +
    'cd /d "%~dp0"\r\n' +
    'set WEBSITE_PORT=0\r\n' +
    'echo Starting Bahuckel chat server (marketing site: use start-website.bat)...\r\n' +
    'start "" bahuckel-server.exe\r\n' +
    'echo Chat app: http://localhost:3001\r\n',
  'utf8'
);
console.log('Created', startBatPath);

const startWebsiteBatPath = path.join(releaseDir, 'start-website.bat');
fs.writeFileSync(
  startWebsiteBatPath,
  '@echo off\r\n' +
    'cd /d "%~dp0"\r\n' +
    'echo Starting marketing site on port 8080...\r\n' +
    'start "" bahuckel-website.exe\r\n' +
    'echo Open http://127.0.0.1:8080\r\n',
  'utf8'
);
console.log('Created', startWebsiteBatPath);

// sql.js (SQLite) needs WASM on disk — SEA bundle cannot embed it. Ship next to exe for server GUI / portable release.
const sqlWasmCandidates = [
  path.join(root, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
  path.join(root, 'server', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
];
const sqlWasmDest = path.join(releaseDir, 'sql-wasm.wasm');
let sqlWasmSrc = '';
for (const p of sqlWasmCandidates) {
  if (fs.existsSync(p)) {
    sqlWasmSrc = p;
    break;
  }
}
if (sqlWasmSrc) {
  fs.copyFileSync(sqlWasmSrc, sqlWasmDest);
  console.log('Copied sql-wasm.wasm to', sqlWasmDest);
} else {
  console.warn('sql-wasm.wasm not found (tried hoisted + server node_modules). npm install sql.js.');
}

console.log('Done. Chat:', path.join(releaseDir, 'bahuckel-server.exe'), '| Marketing:', path.join(releaseDir, 'bahuckel-website.exe'));
console.log('Run from release/ so bahuckel-server.exe finds public/ and bahuckel-website.exe finds public-website/.');
