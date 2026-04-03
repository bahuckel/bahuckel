/** Sorted DM text channel id (matches server). */
export function dmChannelId(myUsername: string, otherUsername: string): string {
  const [a, b] = [myUsername, otherUsername].sort((x, y) => x.localeCompare(y));
  return `dm:${a}:${b}`;
}

/** Friend voice call — both users must be friends (server validates). */
export function dmVoiceChannelId(a: string, b: string): string {
  const [x, y] = [a, b].sort((p, q) => p.localeCompare(q));
  return `dm-voice:${x}:${y}`;
}

/** Given a dm-voice channel id and your username, returns the other participant's username. */
export function parseDmVoicePeer(channelId: string, myUsername: string): string | null {
  const parts = channelId.split(':');
  if (parts.length !== 3 || parts[0] !== 'dm-voice') return null;
  const u1 = parts[1];
  const u2 = parts[2];
  const me = myUsername.trim().toLowerCase();
  if (u1.trim().toLowerCase() === me) return u2;
  if (u2.trim().toLowerCase() === me) return u1;
  return null;
}
