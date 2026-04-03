/**
 * GIF search goes through the Bahuckel server (`/api/gifs/*`) so the Giphy API key stays server-side only.
 * Set `GIPHY_API_KEY` or `BAHUCKEL_GIPHY_API_KEY` in the server process environment (not in the client).
 */

import { getHttpApiOrigin } from './serverOrigin';

export type GiphyResult = {
  id: string;
  sendUrl: string;
  previewUrl: string;
  title: string;
};

type GiphyImageSet = {
  url?: string;
  width?: string;
  height?: string;
};

type GiphyDatum = {
  id: string;
  title?: string;
  images?: {
    downsized?: GiphyImageSet;
    fixed_height_small?: GiphyImageSet;
    fixed_height?: GiphyImageSet;
    original?: GiphyImageSet;
  };
};

function pickSendUrl(d: GiphyDatum): string {
  const im = d.images;
  const u =
    im?.downsized?.url ||
    im?.fixed_height?.url ||
    im?.original?.url ||
    im?.fixed_height_small?.url;
  return u && /^https:\/\//i.test(u) ? u : '';
}

function pickPreviewUrl(d: GiphyDatum): string {
  const im = d.images;
  const u =
    im?.fixed_height_small?.url ||
    im?.fixed_height?.url ||
    im?.downsized?.url ||
    im?.original?.url;
  return u && /^https:\/\//i.test(u) ? u : '';
}

function mapDatum(d: GiphyDatum): GiphyResult | null {
  const sendUrl = pickSendUrl(d);
  if (!sendUrl) return null;
  return {
    id: d.id,
    sendUrl,
    previewUrl: pickPreviewUrl(d) || sendUrl,
    title: typeof d.title === 'string' ? d.title : 'GIF',
  };
}

function apiBase(): string {
  return getHttpApiOrigin();
}

/** Whether the server reports GIF search is configured (key present). */
export async function fetchGiphyEnabled(): Promise<boolean> {
  const base = apiBase();
  if (!base) return false;
  try {
    const r = await fetch(new URL('/api/gifs/status', base).toString());
    if (!r.ok) return false;
    const j = (await r.json()) as { enabled?: boolean };
    return !!j.enabled;
  } catch {
    return false;
  }
}

export async function giphyTrending(limit = 24): Promise<GiphyResult[]> {
  const base = apiBase();
  if (!base) return [];
  const u = new URL('/api/gifs/trending', base);
  u.searchParams.set('limit', String(limit));
  const res = await fetch(u.toString());
  if (res.status === 503) return [];
  if (!res.ok) throw new Error(`GIFs: ${res.status}`);
  const json = (await res.json()) as { data?: GiphyDatum[] };
  const list = Array.isArray(json.data) ? json.data : [];
  return list.map(mapDatum).filter((x): x is GiphyResult => x !== null);
}

export async function giphySearch(q: string, limit = 24): Promise<GiphyResult[]> {
  const base = apiBase();
  if (!base) return [];
  const query = q.trim();
  const u = new URL('/api/gifs/search', base);
  u.searchParams.set('limit', String(limit));
  if (query) u.searchParams.set('q', query);
  const res = await fetch(u.toString());
  if (res.status === 503) return [];
  if (!res.ok) throw new Error(`GIFs: ${res.status}`);
  const json = (await res.json()) as { data?: GiphyDatum[] };
  const list = Array.isArray(json.data) ? json.data : [];
  return list.map(mapDatum).filter((x): x is GiphyResult => x !== null);
}
