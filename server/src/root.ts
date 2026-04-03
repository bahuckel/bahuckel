import path from 'path';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const isPkg = typeof (process as NodeJS.Process & { pkg?: unknown }).pkg !== 'undefined';

function getAppRoot(): string {
  if (isPkg) return path.dirname(process.execPath);
  // Standalone server exe (e.g. Node SEA "Bahuckel Server.exe"): key file must live next to the exe.
  // import.meta.url for SEA often resolves such that dirname(..) is one level above the exe — wrong for giphy-api-key.txt.
  const exeBasename = path.basename(process.execPath).toLowerCase();
  if (exeBasename !== 'node.exe' && exeBasename !== 'node') {
    return path.dirname(process.execPath);
  }
  if (typeof import.meta !== 'undefined' && (import.meta as { url?: string }).url) {
    const dir = path.dirname(fileURLToPath((import.meta as { url: string }).url));
    return path.join(dir, '..');
  }
  try {
    return (new Function('path', 'return path.join(__dirname, "..")') as (p: typeof path) => string)(path);
  } catch {
    return path.join(path.dirname(process.execPath), '..');
  }
}

export const APP_ROOT = getAppRoot();

/** Stable per-user directory so data survives server rebuilds / cwd changes (override with BAHUCKEL_DATA_DIR). */
function getPersistentServerDataDir(): string {
  if (process.platform === 'win32') {
    const base = process.env.APPDATA || path.join(homedir(), 'AppData', 'Roaming');
    return path.join(base, 'Bahuckel', 'server');
  }
  if (process.platform === 'darwin') {
    return path.join(homedir(), 'Library', 'Application Support', 'Bahuckel', 'server');
  }
  return path.join(homedir(), '.local', 'share', 'bahuckel', 'server');
}

const LEGACY_DATA_DIR = path.join(APP_ROOT, 'data');

function hasServerDataFiles(dir: string): boolean {
  return (
    existsSync(path.join(dir, 'store.sqlite')) ||
    existsSync(path.join(dir, 'users.json')) ||
    existsSync(path.join(dir, 'users.json.enc')) ||
    existsSync(path.join(dir, 'encryption.key'))
  );
}

function resolveDataDir(): string {
  if (process.env.BAHUCKEL_DATA_DIR) return path.resolve(process.env.BAHUCKEL_DATA_DIR);
  const persistent = getPersistentServerDataDir();
  if (hasServerDataFiles(LEGACY_DATA_DIR)) return LEGACY_DATA_DIR;
  if (hasServerDataFiles(persistent)) return persistent;
  return persistent;
}

export const DATA_DIR = resolveDataDir();
export const CERT_DIR = path.join(APP_ROOT, 'certs');
