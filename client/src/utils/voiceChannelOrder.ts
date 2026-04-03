/** Server sends voice members sorted by joinedAt; client re-sorts after merges so UI stays consistent. */

export type VoiceChannelMemberRow = {
  clientId: string;
  userName: string;
  muted: boolean;
  deafened?: boolean;
  joinedAt?: number;
};

export function sortVoiceMembersByJoinedAt<T extends { joinedAt?: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0));
}

export function normalizeVoiceChannelStateMap(
  raw: Record<string, VoiceChannelMemberRow[] | undefined>
): Record<string, VoiceChannelMemberRow[]> {
  const out: Record<string, VoiceChannelMemberRow[]> = {};
  for (const [id, arr] of Object.entries(raw)) {
    if (!Array.isArray(arr)) continue;
    out[id] = sortVoiceMembersByJoinedAt(arr);
  }
  return out;
}
