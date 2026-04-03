import { getHttpApiOrigin, normalizeCanonicalOrigin, SESSION_KEY } from './serverOrigin';

/** Persist ?server= so avatars still work after history.replaceState (e.g. invite link cleanup). */
export function persistServerBaseFromUrl(): void {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return;
  try {
    const params = new URLSearchParams(window.location.search);
    const server = params.get('server');
    if (server?.trim() && /^https?:\/\//i.test(server.trim())) {
      sessionStorage.setItem(SESSION_KEY, normalizeCanonicalOrigin(server.trim()));
    }
  } catch {
    /* ignore */
  }
}

/** Avatar img src from API. cacheBust: optional bust for cache when avatars update. */
export function getAvatarImageUrl(username: string, cacheBust?: number): string {
  if (!username) return '';
  const base = getHttpApiOrigin();
  const path = `/api/avatar/${encodeURIComponent(username)}`;
  const full = base ? new URL(path, base).href : path;
  return cacheBust != null ? `${full}${full.includes('?') ? '&' : '?'}v=${cacheBust}` : full;
}

/** Legacy: data URL. Used only for backwards compat (e.g. settings preview before save). */
export function getAvatarImgSrc(avatarValue: string | undefined): string {
  if (!avatarValue || !avatarValue.startsWith('data:image/')) return '';
  return avatarValue;
}
