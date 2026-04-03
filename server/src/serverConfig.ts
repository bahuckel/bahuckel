import { existsSync, readFileSync, watchFile } from 'fs';
import { join } from 'path';
import { DATA_DIR, APP_ROOT } from './root.js';
import type { MessageRecord } from './store.js';

/** -1 = unlimited for both limits */
export type ServerRuntimeConfig = {
  maxMessagesPerChannel: number;
  maxImageAttachmentsPerChannel: number;
};

const DEFAULT: ServerRuntimeConfig = {
  maxMessagesPerChannel: -1,
  maxImageAttachmentsPerChannel: -1,
};

let cached: ServerRuntimeConfig = { ...DEFAULT };

function configPaths(): string[] {
  return [join(DATA_DIR, 'server-config.json'), join(APP_ROOT, 'server-config.json')];
}

function findConfigPath(): string | null {
  for (const p of configPaths()) {
    if (existsSync(p)) return p;
  }
  return null;
}

function parseJson(raw: string): ServerRuntimeConfig {
  const j = JSON.parse(raw) as Record<string, unknown>;
  const maxMessagesPerChannel =
    typeof j.maxMessagesPerChannel === 'number' && Number.isFinite(j.maxMessagesPerChannel)
      ? Math.floor(j.maxMessagesPerChannel)
      : DEFAULT.maxMessagesPerChannel;
  const maxImageAttachmentsPerChannel =
    typeof j.maxImageAttachmentsPerChannel === 'number' && Number.isFinite(j.maxImageAttachmentsPerChannel)
      ? Math.floor(j.maxImageAttachmentsPerChannel)
      : DEFAULT.maxImageAttachmentsPerChannel;
  return { maxMessagesPerChannel, maxImageAttachmentsPerChannel };
}

/** Load from disk into cache. Call at startup and when config file changes. */
export function loadServerConfig(): ServerRuntimeConfig {
  const path = findConfigPath();
  if (!path) {
    cached = { ...DEFAULT };
    return cached;
  }
  try {
    const raw = readFileSync(path, 'utf8');
    cached = parseJson(raw);
  } catch (e) {
    console.warn('[server-config] read failed, using defaults:', e);
    cached = { ...DEFAULT };
  }
  return cached;
}

export function getServerConfig(): ServerRuntimeConfig {
  return { ...cached };
}

/**
 * Enforce retention on a channel's message list (mutates in place).
 * Order: trim oldest messages if over maxMessagesPerChannel; then remove oldest image messages if over maxImageAttachmentsPerChannel.
 */
export function enforceChannelRetention(list: MessageRecord[]): void {
  const cfg = getServerConfig();
  if (cfg.maxMessagesPerChannel > 0 && list.length > cfg.maxMessagesPerChannel) {
    const remove = list.length - cfg.maxMessagesPerChannel;
    list.splice(0, remove);
  }
  if (cfg.maxImageAttachmentsPerChannel > 0) {
    const withImage = list.filter((m) => m.attachment?.type === 'image');
    while (withImage.length > cfg.maxImageAttachmentsPerChannel) {
      const oldest = withImage.shift();
      if (!oldest) break;
      const idx = list.findIndex((m) => m.id === oldest.id);
      if (idx !== -1) list.splice(idx, 1);
    }
  }
}

/** Watch known paths so hosts can edit server-config.json without restart. */
export function startServerConfigWatcher(): void {
  for (const p of configPaths()) {
    try {
      watchFile(p, { interval: 12000 }, () => {
        if (existsSync(p)) {
          loadServerConfig();
          console.log('[server-config] reloaded from', p);
        }
      });
    } catch {
      /* ignore */
    }
  }
}
