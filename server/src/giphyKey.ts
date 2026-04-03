import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { createInterface } from 'readline';
import { APP_ROOT, DATA_DIR } from './root.js';

/**
 * Key file locations tried in order (after env vars):
 * - APP_ROOT: folder containing bahuckel-server.exe (often …/resources when using the Server GUI).
 * - Parent of APP_ROOT: same folder as Bahuckel Server.exe (GUI) — operators often put the key there.
 * - DATA_DIR: persistent app data (e.g. %APPDATA%/Bahuckel/server on Windows).
 */
const KEY_FILE_NAMES = ['giphy-api-key.txt', 'giphy-api-key'];
const SETTINGS_FILE = 'giphy-settings.json';

let memo: string | undefined;

function keySearchDirs(): string[] {
  const dirs = [APP_ROOT, join(APP_ROOT, '..'), DATA_DIR];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of dirs) {
    const norm = resolve(d);
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
  }
  return out;
}

function stripBom(s: string): string {
  return s.replace(/^\uFEFF/, '');
}

function firstNonCommentLine(raw: string): string {
  const text = stripBom(raw);
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    return t;
  }
  return '';
}

function tryReadKeyFromDir(dir: string): string {
  for (const name of KEY_FILE_NAMES) {
    const p = join(dir, name);
    if (!existsSync(p)) continue;
    try {
      const key = firstNonCommentLine(readFileSync(p, 'utf8')).trim();
      if (key) return key;
    } catch {
      /* ignore */
    }
  }
  return '';
}

function readPersistedJson(): string {
  const p = join(DATA_DIR, SETTINGS_FILE);
  if (!existsSync(p)) return '';
  try {
    const j = JSON.parse(readFileSync(p, 'utf8')) as { apiKey?: string };
    return (j.apiKey || '').trim();
  } catch {
    return '';
  }
}

function question(rl: ReturnType<typeof createInterface>, prompt: string): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

/** Persist key next to other server data (survives repo cleans). */
export function saveGiphyApiKeyToDisk(key: string): void {
  const trimmed = key.trim();
  if (!trimmed) return;
  writeFileSync(join(DATA_DIR, SETTINGS_FILE), JSON.stringify({ apiKey: trimmed }, null, 0), 'utf8');
  memo = trimmed;
}

/**
 * Resolve Giphy key before listening: env → app data JSON → legacy key files → CLI prompt (TTY) or exit.
 * When launched from the Server GUI, `GIPHY_API_KEY` should be set; otherwise the process exits if no key is found.
 */
export async function ensureGiphyKeyConfigured(): Promise<void> {
  const env = (process.env.GIPHY_API_KEY || process.env.BAHUCKEL_GIPHY_API_KEY || '').trim();
  if (env) {
    memo = env;
    return;
  }

  const fromJson = readPersistedJson();
  if (fromJson) {
    memo = fromJson;
    return;
  }

  for (const dir of keySearchDirs()) {
    const key = tryReadKeyFromDir(dir);
    if (key) {
      memo = key;
      saveGiphyApiKeyToDisk(key);
      return;
    }
  }

  const fromGui = process.env.BAHUCKEL_SERVER_GUI === '1';
  if (fromGui) {
    console.error(
      'Giphy API key is required. Open the Bahuckel Server window, enter your Giphy API key (same panel as owner account), save, then start or restart the server.',
    );
    process.exit(1);
  }

  if (process.stdin.isTTY && process.stdout.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    console.log('A Giphy API key is required for the in-app GIF picker. Create one at https://developers.giphy.com/');
    const line = await question(rl, 'Giphy API key: ');
    rl.close();
    const trimmed = line.trim();
    if (!trimmed) {
      console.error('No key entered. Exiting.');
      process.exit(1);
    }
    memo = trimmed;
    saveGiphyApiKeyToDisk(trimmed);
    console.log(`Giphy API key saved to ${join(DATA_DIR, SETTINGS_FILE)}`);
    return;
  }

  console.error(
    `Giphy API key is required. Set GIPHY_API_KEY, add it in the Server GUI, or run from a terminal once. You can also create ${join(DATA_DIR, SETTINGS_FILE)} with {"apiKey":"YOUR_KEY"}.`,
  );
  process.exit(1);
}

/**
 * Giphy API key: cached after ensureGiphyKeyConfigured(); env override, else persisted / legacy files.
 */
export function getGiphyApiKey(): string {
  if (memo !== undefined) return memo;
  const env = (process.env.GIPHY_API_KEY || process.env.BAHUCKEL_GIPHY_API_KEY || '').trim();
  if (env) {
    memo = env;
    return env;
  }
  const fromJson = readPersistedJson();
  if (fromJson) {
    memo = fromJson;
    return fromJson;
  }
  for (const dir of keySearchDirs()) {
    const key = tryReadKeyFromDir(dir);
    if (key) {
      memo = key;
      return key;
    }
  }
  memo = '';
  return memo;
}
