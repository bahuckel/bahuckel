import type { VoiceSoundId } from '../constants';
import { getHttpApiOrigin } from './serverOrigin';

/**
 * Absolute URL for a file under `/sounds/…` (Vite `client/public/sounds` → `/sounds/…` when served).
 * Prefer the **page** origin in http(s) so dev (UI on :5173, API on :3001) loads sounds from Vite, not the API host.
 * Fall back to `getHttpApiOrigin()` for Electron / edge cases, then `file:` / `app:` relative to `index.html`.
 */
function resolveBundledSoundUrl(pathFromRoot: string): string {
  const rel = pathFromRoot.replace(/^\//, '');
  if (typeof window !== 'undefined' && window.location?.href) {
    try {
      const u = new URL(window.location.href);
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        return new URL(rel, `${u.origin}/`).href;
      }
      return new URL(rel, window.location.href).href;
    } catch {
      /* ignore */
    }
  }
  const api = getHttpApiOrigin();
  if (api) {
    return `${api.replace(/\/$/, '')}/${rel}`;
  }
  const base = typeof import.meta.env.BASE_URL === 'string' ? import.meta.env.BASE_URL : '/';
  try {
    const page = typeof window !== 'undefined' ? window.location.href : 'http://localhost/';
    return new URL(rel, new URL(base, page)).href;
  } catch {
    return `/${rel}`;
  }
}

/**
 * Play a short notification beep. Uses Web Audio API - works on Windows, Mac, Linux.
 */
export function playConnectSound(): void {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 800;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  } catch {
    /* ignore if AudioContext unavailable */
  }
}

/** Shipped under `/sounds/` (e.g. `client/public/sounds` or `release/public/sounds`). Tried in order. */
const BUNDLED_JOIN_PATHS = ['/sounds/voice-join.mp3', '/sounds/voice-join.webm', '/sounds/join.mp3'];
const BUNDLED_LEAVE_PATHS = ['/sounds/voice-leave.mp3', '/sounds/voice-leave.webm', '/sounds/leave.mp3'];

function playPresetSound(preset: VoiceSoundId): void {
  if (preset === 'none' || preset === 'custom') return;
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    if (preset === 'chime') {
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    } else if (preset === 'pop') {
      osc.frequency.value = 440;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.08);
    } else if (preset === 'click') {
      osc.frequency.value = 1200;
      osc.type = 'square';
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.04);
    } else if (preset === 'bell') {
      osc.frequency.value = 660;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    }
  } catch {
    /* ignore */
  }
}

function playCustomSound(url: string | null | undefined): void {
  if (!url) return;
  if (!url.startsWith('data:') && !url.startsWith('blob:') && !url.startsWith('http://') && !url.startsWith('https://')) return;
  try {
    const audio = new Audio(url);
    audio.volume = 0.5;
    audio.play().catch(() => {});
  } catch {
    /* ignore */
  }
}

/** Try static files from `public/sounds` (served as `/sounds/…`); fall back to `thenFallback` if none load. */
function tryBundledVoice(kind: 'join' | 'leave', thenFallback: () => void): void {
  const paths = kind === 'join' ? BUNDLED_JOIN_PATHS : BUNDLED_LEAVE_PATHS;
  let i = 0;
  const tryNext = () => {
    if (i >= paths.length) {
      thenFallback();
      return;
    }
    const url = resolveBundledSoundUrl(paths[i++]);
    const a = new Audio(url);
    a.volume = 0.45;
    a.onerror = () => tryNext();
    a.play().catch(() => tryNext());
  };
  tryNext();
}

export function playVoiceJoinSound(
  preset?: VoiceSoundId | null,
  customUrl?: string | null
): void {
  try {
    const p = preset ?? (localStorage.getItem('bahuckel_voice_join_sound') as VoiceSoundId | null) ?? 'chime';
    const url = customUrl ?? localStorage.getItem('bahuckel_voice_join_sound_url');
    if (p === 'custom' && url) {
      playCustomSound(url);
    } else if (p !== 'none') {
      tryBundledVoice('join', () => playPresetSound(p));
    }
  } catch {
    playPresetSound('chime');
  }
}

export function playVoiceLeaveSound(
  preset?: VoiceSoundId | null,
  customUrl?: string | null
): void {
  try {
    const p = preset ?? (localStorage.getItem('bahuckel_voice_leave_sound') as VoiceSoundId) ?? 'pop';
    const url = customUrl ?? localStorage.getItem('bahuckel_voice_leave_sound_url');
    if (p === 'custom' && url) {
      playCustomSound(url);
    } else if (p !== 'none') {
      tryBundledVoice('leave', () => playPresetSound(p));
    }
  } catch {
    playPresetSound('pop');
  }
}
