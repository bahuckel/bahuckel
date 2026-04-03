/** Shared API / WebSocket base resolution for static site + API on another host (e.g. bahuckel.com → chat.bahuckel.com). */

export const SESSION_KEY = 'bahuckel-server-base';

/** bahuckel.com / www host marketing only — API + WebSocket live on chat.bahuckel.com (or VITE_WS_ORIGIN). */
function isBahuckelMarketingApex(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === 'bahuckel.com' || h === 'www.bahuckel.com';
}

/**
 * Marketing apex URLs: map to VITE_WS_ORIGIN when set, else same-origin (reverse-proxy /ws on one host).
 * Avoids hardcoding https://chat.bahuckel.com when that hostname has no DNS yet (ERR_NAME_NOT_RESOLVED).
 */
export function normalizeCanonicalOrigin(raw: string): string {
  const trimmed = raw.replace(/\/$/, '');
  try {
    const u = new URL(trimmed);
    const host = u.hostname.toLowerCase();
    if (host === 'bahuckel.com' || host === 'www.bahuckel.com') {
      const env = import.meta.env.VITE_WS_ORIGIN?.trim();
      if (env && /^https?:\/\//i.test(env)) return env.replace(/\/$/, '');
      if (typeof window !== 'undefined' && window.location?.origin && /^https?:\/\//i.test(window.location.origin)) {
        return window.location.origin.replace(/\/$/, '');
      }
      /* Electron (file:// / app:// bundled client) and other non-HTTPS page origins: keep the configured URL (e.g. getServerUrl).
         Do not force chat.bahuckel.com — that split the desktop client from browser users on bahuckel.com/ws. */
      return trimmed;
    }
  } catch {
    /* ignore */
  }
  return trimmed;
}

/**
 * HTTP(S) origin for /api, /emoji, avatars.
 * Priority: runtime override → Electron → ?server= → sessionStorage → VITE_WS_ORIGIN → location.
 */
export function getHttpApiOrigin(): string {
  if (typeof window === 'undefined' || !window.location) return '';
  const runtime = window.__BAHUCKEL_API_ORIGIN__?.trim();
  if (runtime && /^https?:\/\//i.test(runtime)) {
    return runtime.replace(/\/$/, '');
  }
  const win = window as Window & { bahuckel?: { getServerUrl?: () => string } };
  const fromElectron = win.bahuckel?.getServerUrl?.();
  if (fromElectron && /^https?:\/\//i.test(fromElectron.trim())) {
    return normalizeCanonicalOrigin(fromElectron.trim());
  }
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get('server')?.trim();
  if (fromQuery && /^https?:\/\//i.test(fromQuery)) return normalizeCanonicalOrigin(fromQuery);
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored && /^https?:\/\//i.test(stored)) return normalizeCanonicalOrigin(stored);
  } catch {
    /* ignore */
  }
  const pageHost = window.location.hostname.toLowerCase();
  const viteOrigin = import.meta.env.VITE_WS_ORIGIN?.trim();
  if (viteOrigin && /^https?:\/\//i.test(viteOrigin)) {
    const cleaned = viteOrigin.replace(/\/$/, '');
    try {
      const envHost = new URL(cleaned).hostname.toLowerCase();
      if (envHost === pageHost && !isBahuckelMarketingApex(pageHost)) {
        return window.location.origin.replace(/\/$/, '');
      }
    } catch {
      /* ignore */
    }
    return normalizeCanonicalOrigin(cleaned);
  }
  const o = window.location.origin;
  if (o && o !== 'null' && /^https?:\/\//i.test(o)) return normalizeCanonicalOrigin(o);
  return '';
}

/**
 * WebSocket URL — always derived from {@link getHttpApiOrigin} so there is a single resolution path.
 */
export function getWebSocketUrl(): string {
  if (typeof location === 'undefined') return 'ws://localhost:3001/ws';
  const o = getHttpApiOrigin();
  if (!o) return 'ws://localhost:3001/ws';
  try {
    const u = new URL(o);
    const wsProto = u.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProto}//${u.host}/ws`;
  } catch {
    return 'ws://localhost:3001/ws';
  }
}
