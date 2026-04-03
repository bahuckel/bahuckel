import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { DATA_DIR } from './root.js';

const JOIN_REQUESTS_PATH = join(DATA_DIR, 'join_requests.json');

export type JoinRequestRecord = {
  id: string;
  serverId: string;
  username: string;
  requestedAt: string;
  status: 'pending' | 'accepted' | 'declined';
};

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function load(): JoinRequestRecord[] {
  ensureDataDir();
  if (!existsSync(JOIN_REQUESTS_PATH)) return [];
  try {
    const raw = readFileSync(JOIN_REQUESTS_PATH, 'utf-8');
    const data = JSON.parse(raw) as { requests?: JoinRequestRecord[] };
    return Array.isArray(data.requests) ? data.requests : [];
  } catch {
    return [];
  }
}

function save(requests: JoinRequestRecord[]): void {
  ensureDataDir();
  writeFileSync(JOIN_REQUESTS_PATH, JSON.stringify({ requests }, null, 0), 'utf-8');
}

function nextId(): string {
  return Date.now().toString(36) + randomBytes(4).toString('hex');
}

export function addJoinRequest(serverId: string, username: string): { ok: boolean; id?: string; error?: string } {
  const requests = load();
  const u = username.trim();
  if (!u || !serverId) return { ok: false, error: 'Invalid request' };
  const already = requests.some(
    (r) => r.serverId === serverId && r.username.toLowerCase() === u.toLowerCase() && r.status === 'pending'
  );
  if (already) return { ok: false, error: 'You already have a pending request for this server' };
  const id = nextId();
  requests.push({
    id,
    serverId,
    username: u,
    requestedAt: new Date().toISOString(),
    status: 'pending',
  });
  save(requests);
  return { ok: true, id };
}

export function getPendingJoinRequests(
  servers: { id: string; name: string; ownerId: string }[],
  currentUser: string,
  isGlobalOwner: boolean
): { id: string; serverId: string; serverName: string; username: string; requestedAt: string }[] {
  const requests = load();
  const pending = requests.filter((r) => r.status === 'pending');
  const serverMap = new Map(servers.map((s) => [s.id, s]));
  return pending
    .filter((r) => {
      const server = serverMap.get(r.serverId);
      if (!server) return false;
      return isGlobalOwner || server.ownerId === currentUser;
    })
    .map((r) => ({
      id: r.id,
      serverId: r.serverId,
      serverName: serverMap.get(r.serverId)?.name ?? 'Unknown',
      username: r.username,
      requestedAt: r.requestedAt,
    }));
}

export function getJoinRequestById(id: string): JoinRequestRecord | undefined {
  return load().find((r) => r.id === id);
}

/** True if user has a pending join request for this server (not yet approved/declined). */
export function hasPendingJoinRequest(serverId: string, username: string): boolean {
  const u = username.trim().toLowerCase();
  if (!u || !serverId) return false;
  return load().some(
    (r) => r.serverId === serverId && r.username.toLowerCase() === u && r.status === 'pending'
  );
}

export function setJoinRequestStatus(id: string, status: 'accepted' | 'declined'): JoinRequestRecord | undefined {
  const requests = load();
  const idx = requests.findIndex((r) => r.id === id);
  if (idx === -1) return undefined;
  requests[idx].status = status;
  save(requests);
  return requests[idx];
}
