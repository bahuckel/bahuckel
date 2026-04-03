/**
 * Emoji: ONLY local PNGs in /emoji/*. NO Unicode.
 * Codepoint list: bundled emojiLocalAssets.json (fallback) + runtime fetch of /emoji/codepoints.json
 * so the same origin that serves PNGs is the source of truth (works for server exe, Electron, dev).
 */

import codepointsListImport from './emojiLocalAssets.json';
import { getHttpApiOrigin } from './utils/serverOrigin';

type JsonList = string[] | { default: string[] };
const raw = codepointsListImport as JsonList;
const codepointsList = Array.isArray(raw) ? raw : raw?.default;
const list = Array.isArray(codepointsList) ? codepointsList : [];
const CODEPOINTS = new Set<string>(list.map((cp) => (typeof cp === 'string' ? cp.toLowerCase() : '')).filter(Boolean));

let serverListLoaded = false;

/** Add codepoints from server so getTwemojiUrl/isEmojiSupported work. Call after fetching /emoji/codepoints.json. */
export function setCodepointsFromServer(codepoints: string[]): void {
  if (!Array.isArray(codepoints)) return;
  codepoints.forEach((cp) => {
    if (typeof cp === 'string' && cp) CODEPOINTS.add(cp.toLowerCase());
  });
  serverListLoaded = true;
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('emoji-codepoints-loaded'));
}

/** Load codepoints from /emoji/codepoints.json. Uses same API origin as WebSocket / avatars. */
export function loadEmojiCodepointsFromServer(): Promise<string[]> {
  const origin = typeof document !== 'undefined' ? getHttpApiOrigin() : '';
  const url = origin ? new URL('/emoji/codepoints.json', origin).href : '';
  if (!url || !url.startsWith('http')) return Promise.resolve([]);
  return fetch(url)
    .then((r) => (r.ok ? r.json() : null))
    .then((arr: unknown) => {
      if (Array.isArray(arr)) {
        const list = arr.filter((cp): cp is string => typeof cp === 'string' && cp.length > 0).map((cp) => cp.toLowerCase());
        setCodepointsFromServer(list);
        return list;
      }
      return [];
    })
    .catch(() => []);
}

/** Base URL for emoji PNGs. */
function baseUrl(): string {
  const origin = typeof window !== 'undefined' ? getHttpApiOrigin() : '';
  if (origin && origin.startsWith('http')) {
    return new URL('/emoji/', origin).href;
  }
  if (typeof window !== 'undefined' && window.location?.origin?.startsWith('http')) {
    return new URL('/emoji/', window.location.origin).href;
  }
  return './emoji/';
}

let _base: string | null = null;
function emojiBase(): string {
  if (_base == null) _base = baseUrl();
  return _base;
}

/** Codepoint string (e.g. "1f600" or "1f1ec-1f1e7") → Unicode character. */
export function codepointToChar(cp: string): string {
  if (!cp || typeof cp !== 'string') return '';
  return cp
    .split('-')
    .map((p) => {
      const n = parseInt(p.trim(), 16);
      return isNaN(n) ? '' : String.fromCodePoint(n);
    })
    .join('');
}

/** Emoji string → Twemoji codepoint e.g. "1f600" or "1f1ec-1f1e7". */
export function toCodePoint(emoji: string): string {
  if (!emoji || typeof emoji !== 'string') return '';
  const parts: string[] = [];
  for (const c of emoji) {
    const cp = c.codePointAt(0);
    if (cp != null) parts.push(cp.toString(16));
  }
  return parts.join('-');
}

/** Resolve to the codepoint key we have in assets (exact, or without trailing -fe0f). Case-insensitive. */
function resolveCodepoint(cp: string): string {
  if (!cp) return '';
  const lower = cp.toLowerCase();
  if (CODEPOINTS.has(lower)) return lower;
  if (lower.endsWith('-fe0f')) {
    const base = lower.slice(0, lower.length - 5);
    if (CODEPOINTS.has(base)) return base;
  }
  return '';
}

/** True only if we have a PNG for this emoji. */
export function isEmojiSupported(emoji: string): boolean {
  const cp = toCodePoint(emoji);
  return cp.length > 0 && resolveCodepoint(cp) !== '';
}

/** URL for the PNG, or "". */
export function getTwemojiUrl(emoji: string): string {
  if (!emoji || typeof emoji !== 'string') return '';
  const cp = toCodePoint(emoji);
  const resolved = resolveCodepoint(cp);
  if (!resolved) return '';
  return emojiBase() + resolved + '.png';
}

/** URL for a PNG by codepoint (e.g. "1f600"). Use in picker when driving from fetched list. */
export function getEmojiImageUrlByCodepoint(codepoint: string): string {
  if (!codepoint || typeof codepoint !== 'string') return '';
  return emojiBase() + codepoint.toLowerCase() + '.png';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Turn bare https image URLs into inline <img> (after escape). Safe: only https, image-like paths. */
function linkifyHttpsImageUrls(escaped: string): string {
  return escaped.replace(/https:\/\/[^\s<]+/gi, (raw) => {
    const trimmed = raw.replace(/[),.;]+$/g, '');
    const suffix = raw.slice(trimmed.length);
    try {
      const u = new URL(trimmed);
      if (u.protocol !== 'https:') return raw;
      const path = u.pathname.toLowerCase();
      const extOk = /\.(gif|png|jpe?g|webp|avif)$/i.test(path);
      if (!extOk) return raw;
      const src = escapeHtml(u.href);
      return `<span class="chat-inline-img-wrap"><img class="chat-inline-img" src="${src}" alt="" loading="lazy" referrerpolicy="no-referrer" /></span>${suffix}`;
    } catch {
      return raw;
    }
  });
}

function applyEmojiReplacements(escaped: string, className: string): string {
  const base = emojiBase();
  const onerror = "this.style.display='none'";

  const imgForCp = (cp: string) =>
    `<span class="twemoji-wrap"><img class="${className}" alt="" data-emoji-cp="${cp}" src="${base}${cp}.png" onerror="${onerror}"/></span>`;

  let out = escaped;
  const sortedCps = [...CODEPOINTS].sort((a, b) => b.length - a.length);
  for (const cp of sortedCps) {
    const char = codepointToChar(cp);
    if (!char) continue;
    out = out.split(char).join(imgForCp(cp));
  }
  return out;
}

/** Message text → HTML with emoji as <img>. Uses codepoint list so we only replace emojis we have assets for. */
export function parseEmojiToHtml(text: string, options?: { className?: string }): string {
  if (!text || typeof text !== 'string') return '';
  const escaped = escapeHtml(text);
  const className = options?.className ?? 'chat-twemoji';
  return applyEmojiReplacements(escaped, className);
}

/** Chat body: escape → optional inline https images → emoji images. */
export function formatChatMessageHtml(text: string, options?: { className?: string }): string {
  if (!text || typeof text !== 'string') return '';
  const escaped = escapeHtml(text);
  const withImages = linkifyHttpsImageUrls(escaped);
  const className = options?.className ?? 'chat-twemoji';
  return applyEmojiReplacements(withImages, className);
}
