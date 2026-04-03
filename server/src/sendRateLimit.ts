/** >10 messages in a rolling 60s window → 10 minutes of max 1 message / 5s */

const WINDOW_MS = 60_000;
const THROTTLE_COOLDOWN_MS = 10 * 60 * 1000;
const MIN_GAP_MS = 5000;

type UserSendState = {
  timestamps: number[];
  throttleUntil: number;
  lastSendAt: number;
};

const byUser = new Map<string, UserSendState>();

function stateFor(username: string): UserSendState {
  const key = username.trim().toLowerCase();
  let s = byUser.get(key);
  if (!s) {
    s = { timestamps: [], throttleUntil: 0, lastSendAt: 0 };
    byUser.set(key, s);
  }
  return s;
}

export function checkSendMessageRate(username: string): { ok: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const s = stateFor(username);
  if (s.throttleUntil > now) {
    if (now - s.lastSendAt < MIN_GAP_MS) {
      return { ok: false, retryAfterMs: Math.max(1, MIN_GAP_MS - (now - s.lastSendAt)) };
    }
    s.timestamps = s.timestamps.filter((t) => now - t < WINDOW_MS);
    s.timestamps.push(now);
    s.lastSendAt = now;
    return { ok: true };
  }
  s.timestamps = s.timestamps.filter((t) => now - t < WINDOW_MS);
  if (s.timestamps.length >= 10) {
    s.throttleUntil = now + THROTTLE_COOLDOWN_MS;
  }
  s.timestamps.push(now);
  s.lastSendAt = now;
  return { ok: true };
}
