import express from 'express';
import cors from 'cors';
import { createServer as createHttpServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket as WsSocket } from 'ws';
import { createInterface } from 'readline';
import { loadStore, saveStore, type MessageRecord, type ServerRecord, type ChannelRecord } from './store.js';
import {
  login as authLogin,
  register as authRegister,
  restoreSession,
  invalidateSession,
  logSecurityEvent,
  hasGlobalOwner,
  createOwner,
  isGlobalOwner,
  requestPasswordReset,
  changePasswordWithSecurityAnswer,
  setNewPasswordWithToken,
  getResetRequests,
  getNameColor,
  getNameColors,
  setUserNameColor,
  getAvatars,
  getAvatarPath,
  setUserAvatar,
  nukeAllAvatarsIfNeeded,
  setUserAboutMe,
  getPublicProfile,
} from './auth.js';
import {
  addJoinRequest,
  getPendingJoinRequests,
  getJoinRequestById,
  setJoinRequestStatus,
  hasPendingJoinRequest,
} from './joinRequests.js';

import { CERT_DIR, APP_ROOT } from './root.js';
import { ensureGiphyKeyConfigured, getGiphyApiKey } from './giphyKey.js';
import { loadServerConfig, enforceChannelRetention, getServerConfig, startServerConfigWatcher } from './serverConfig.js';
import { checkSendMessageRate } from './sendRateLimit.js';

const __dirname = typeof (import.meta as { url?: string }).url === 'string'
  ? dirname(fileURLToPath((import.meta as { url: string }).url))
  : APP_ROOT;

const app = express();
app.use(cors());
app.use(express.json());

const PORT_DEFAULT = Number(process.env.PORT) || 3001;
const PORT_TRY_RAW = process.env.PORT_TRY;
const PORTS_TO_TRY: number[] = PORT_TRY_RAW
  ? PORT_TRY_RAW.split(',').map((p) => parseInt(p.trim(), 10)).filter((p) => p > 0 && p <= 65535)
  : [PORT_DEFAULT];
if (PORTS_TO_TRY.length === 0) PORTS_TO_TRY.push(PORT_DEFAULT);

const certPath = process.env.SSL_CERT_PATH || join(CERT_DIR, 'cert.pem');
const keyPath = process.env.SSL_KEY_PATH || join(CERT_DIR, 'key.pem');
const useHttps = existsSync(certPath) && existsSync(keyPath);
const serverOptions = useHttps
  ? {
      cert: readFileSync(certPath),
      key: readFileSync(keyPath),
    }
  : undefined;

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'bahuckel-node' });
});

/** Public limits for operators (same values sent over WebSocket as server_config). -1 = unlimited */
app.get('/api/server-config', (_req, res) => {
  const c = getServerConfig();
  res.json({
    maxMessagesPerChannel: c.maxMessagesPerChannel,
    maxImageAttachmentsPerChannel: c.maxImageAttachmentsPerChannel,
  });
});

app.get('/api/gifs/status', (_req, res) => {
  res.json({ enabled: !!getGiphyApiKey() });
});

/** Remote GIF attachment from picker — data URLs are not practical for large GIFs; only Giphy HTTPS hosts allowed. */
function parseAllowedGiphyImageUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const s = raw.trim();
  if (s.length === 0 || s.length > 2048) return undefined;
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:') return undefined;
    const h = u.hostname.toLowerCase();
    if (h === 'giphy.com' || h.endsWith('.giphy.com')) return u.href;
    return undefined;
  } catch {
    return undefined;
  }
}

app.get('/api/gifs/trending', async (req, res) => {
  const key = getGiphyApiKey();
  if (!key) {
    res.status(503).json({ error: 'gifs_not_configured', data: [] });
    return;
  }
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || '24'), 10) || 24));
  try {
    const u = new URL('https://api.giphy.com/v1/gifs/trending');
    u.searchParams.set('api_key', key);
    u.searchParams.set('limit', String(limit));
    u.searchParams.set('rating', 'g');
    const r = await fetch(u.toString());
    if (!r.ok) {
      res.status(502).json({ error: 'giphy_upstream', status: r.status });
      return;
    }
    res.json(await r.json());
  } catch {
    res.status(500).json({ error: 'giphy_fetch_failed' });
  }
});

app.get('/api/gifs/search', async (req, res) => {
  const key = getGiphyApiKey();
  if (!key) {
    res.status(503).json({ error: 'gifs_not_configured', data: [] });
    return;
  }
  const q = String(req.query.q || '').trim();
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || '24'), 10) || 24));
  try {
    const u = new URL(q ? 'https://api.giphy.com/v1/gifs/search' : 'https://api.giphy.com/v1/gifs/trending');
    u.searchParams.set('api_key', key);
    u.searchParams.set('limit', String(limit));
    u.searchParams.set('rating', 'g');
    if (q) u.searchParams.set('q', q);
    const r = await fetch(u.toString());
    if (!r.ok) {
      res.status(502).json({ error: 'giphy_upstream', status: r.status });
      return;
    }
    res.json(await r.json());
  } catch {
    res.status(500).json({ error: 'giphy_fetch_failed' });
  }
});

app.get('/api/servers', (_req, res) => {
  res.json([]);
});

app.get('/api/avatar/:username', (req, res) => {
  const username = typeof req.params.username === 'string' ? req.params.username.trim() : '';
  if (!username) return res.status(400).send('Username required');
  const path = getAvatarPath(username);
  if (!path) return res.status(404).send('Avatar not found');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.sendFile(path);
});

// Dev: client/dist next to server. Exe: client in APP_ROOT/public (copy client/dist to release/public when building server exe).
const clientDistDev = join(__dirname, '..', '..', 'client', 'dist');
const clientDistPublic = join(APP_ROOT, 'public');
const clientDist = existsSync(join(clientDistDev, 'index.html'))
  ? clientDistDev
  : existsSync(join(clientDistPublic, 'index.html'))
    ? clientDistPublic
    : null;
if (clientDist) {
  const emojiDir = join(clientDist, 'emoji');
  if (existsSync(emojiDir)) {
    app.use('/emoji', express.static(emojiDir));
    const codepointsPath = join(emojiDir, 'codepoints.json');
    const count = existsSync(codepointsPath) ? (() => { try { return (JSON.parse(readFileSync(codepointsPath, 'utf8')) as unknown[]).length; } catch { return 0; } })() : 0;
    console.log('Emoji: serving', emojiDir, '(codepoints:', count, ')');
  } else {
    console.warn('Emoji: directory not found at', emojiDir);
  }
  app.use(express.static(clientDist, {
    setHeaders: (res, p) => {
      const filePath = String(p);
      if (filePath.endsWith('index.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      }
    },
  }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.sendFile(join(clientDist, 'index.html'));
  });
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API route not found' });
  });
  console.log('Static: serving from', clientDist);
}

/** Marketing / landing pages (optional). Dev: website/dist. Release: APP_ROOT/public-website */
const websiteDistDev = join(__dirname, '..', '..', 'website', 'dist');
const websiteDistPublic = join(APP_ROOT, 'public-website');
const websiteRoot = existsSync(join(websiteDistDev, 'index.html'))
  ? websiteDistDev
  : existsSync(join(websiteDistPublic, 'index.html'))
    ? websiteDistPublic
    : null;
if (websiteRoot) {
  console.log('Public site: files at', websiteRoot);
} else {
  console.log('Public site: not built (optional). Run: npm run build:website');
}

nukeAllAvatarsIfNeeded();

let servers: ServerRecord[];
let channels: ChannelRecord[];
let messagesByChannel: Map<string, MessageRecord[]>;
let friends: [string, string][];
let friendRequests: { from: string; to: string }[];
let invites: { serverId: string; code: string }[];
let userServerOrder: Record<string, string[]>;

function persist() {
  const messagesObj: Record<string, MessageRecord[]> = {};
  messagesByChannel.forEach((list, channelId) => {
    messagesObj[channelId] = list;
  });
  void saveStore({ servers, channels, messagesByChannel: messagesObj, friends, friendRequests, invites, userServerOrder }).catch((e) =>
    console.error('Persist failed:', e)
  );
}

async function initStore() {
  const persisted = await loadStore();
  servers = persisted.servers;
  channels = persisted.channels;
  messagesByChannel = new Map<string, MessageRecord[]>();
  for (const [channelId, list] of Object.entries(persisted.messagesByChannel)) {
    if (Array.isArray(list)) messagesByChannel.set(channelId, list);
  }
  friends = Array.isArray(persisted.friends) ? persisted.friends : [];
  friendRequests = Array.isArray(persisted.friendRequests) ? persisted.friendRequests : [];
  invites = Array.isArray(persisted.invites) ? persisted.invites : [];
  userServerOrder = persisted.userServerOrder && typeof persisted.userServerOrder === 'object' ? persisted.userServerOrder : {};
  loadServerConfig();
  for (const [, list] of messagesByChannel) {
    enforceChannelRetention(list);
  }
  persist();
}

function findMessage(channelId: string, messageId: string): MessageRecord | null {
  const list = messagesByChannel.get(channelId);
  if (!list) return null;
  return list.find((m) => m.id === messageId) ?? null;
}

function isServerAdmin(serverId: string, username: string): boolean {
  const server = servers.find((s) => s.id === serverId);
  if (!server) return false;
  if (isGlobalOwner(username)) return true;
  if (server.ownerId && server.ownerId.trim().toLowerCase() === username.trim().toLowerCase()) return true;
  return false;
}

/** True if user can manage channels: server owner, global owner, or has role with manageChannels permission. */
function userCanManageChannels(serverId: string, username: string): boolean {
  if (isServerAdmin(serverId, username)) return true;
  const server = servers.find((s) => s.id === serverId);
  if (!server) return false;
  const un = username.trim().toLowerCase();
  const memberRoles = server.memberRoles ?? {};
  const roleId = memberRoles[un];
  if (!roleId) return false;
  const role = (server.roles ?? []).find((r) => r.id === roleId);
  return !!(role?.permissions?.manageChannels);
}

/** True if user may create new servers via Add server (global owner, empty instance, any server owner, or role with createServer on a server they belong to). */
function userCanCreateServers(username: string): boolean {
  if (!username.trim()) return false;
  if (isGlobalOwner(username)) return true;
  if (servers.length === 0) return true;
  const un = username.trim().toLowerCase();
  if (servers.some((s) => s.ownerId && s.ownerId.trim().toLowerCase() === un)) return true;
  return servers.some((server) => {
    const memberRoles = server.memberRoles ?? {};
    const roleId = memberRoles[un];
    if (!roleId) return false;
    const role = (server.roles ?? []).find((r) => r.id === roleId);
    return !!(role?.permissions?.createServer);
  });
}

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function dmKey(user1: string, user2: string): string {
  const [a, b] = [user1, user2].sort((x, y) => x.localeCompare(y));
  return `dm:${a}:${b}`;
}

function areFriends(u1: string, u2: string): boolean {
  const l = (x: string) => x.toLowerCase();
  return friends.some(([a, b]) => (l(a) === l(u1) && l(b) === l(u2)) || (l(a) === l(u2) && l(b) === l(u1)));
}

function getFriendsForUser(username: string): string[] {
  const lower = username.toLowerCase();
  const out: string[] = [];
  for (const [a, b] of friends) {
    if (lower === a.toLowerCase()) out.push(b);
    else if (lower === b.toLowerCase()) out.push(a);
  }
  return out;
}

function nextId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

const httpServer = useHttps && serverOptions
  ? createHttpsServer(serverOptions, app)
  : createHttpServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

type ClientId = string;
const channelSubs = new Map<string, Set<ClientId>>();
const clientToWs = new Map<ClientId, WsSocket>();
const clientToUserId = new Map<ClientId, string>();
const clientToUserName = new Map<ClientId, string>();
const clientIdToSessionToken = new Map<ClientId, string>();
const clientToIp = new Map<ClientId, string>();

const voiceChannelMembers = new Map<string, Set<ClientId>>();

const AUTH_RATE_WINDOW_MS = 60 * 1000;
const AUTH_RATE_MAX_PER_IP = 20;
const authRateByIp = new Map<string, { count: number; resetAt: number }>();

function getClientIp(req: { socket?: { remoteAddress?: string }; headers?: Record<string, string | string[] | undefined> }): string {
  const forwarded = req.headers?.['x-forwarded-for'];
  const first = Array.isArray(forwarded) ? forwarded[0] : typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : undefined;
  const ip = (first || req.socket?.remoteAddress || 'unknown').trim();
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

function isAuthRateLimited(ip: string): boolean {
  const now = Date.now();
  let entry = authRateByIp.get(ip);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + AUTH_RATE_WINDOW_MS };
    authRateByIp.set(ip, entry);
  }
  entry.count += 1;
  return entry.count > AUTH_RATE_MAX_PER_IP;
}

const clientToVoiceChannel = new Map<ClientId, string>();
const clientToVoiceMuted = new Map<ClientId, boolean>();
const clientToVoiceDeafened = new Map<ClientId, boolean>();
/** When this client session joined the current voice channel (ms). Longest-in-call sorts first (ascending). */
const clientVoiceJoinedAt = new Map<ClientId, number>();

function buildVoiceMemberRowsSorted(channelId: string) {
  const members = Array.from(voiceChannelMembers.get(channelId) ?? []);
  const rows = members.map((cid) => ({
    clientId: cid,
    userId: clientToUserId.get(cid) ?? 'anon',
    userName: clientToUserName.get(cid) ?? 'Anonymous',
    muted: clientToVoiceMuted.get(cid) ?? false,
    deafened: clientToVoiceDeafened.get(cid) ?? false,
    joinedAt: clientVoiceJoinedAt.get(cid) ?? Date.now(),
  }));
  rows.sort((a, b) => a.joinedAt - b.joinedAt);
  return rows;
}

function getVoiceChannelState(): Record<string, { clientId: string; userName: string; muted: boolean; deafened: boolean; joinedAt: number }[]> {
  const out: Record<string, { clientId: string; userName: string; muted: boolean; deafened: boolean; joinedAt: number }[]> = {};
  for (const [channelId] of voiceChannelMembers) {
    out[channelId] = buildVoiceMemberRowsSorted(channelId).map(({ clientId, userName, muted, deafened, joinedAt }) => ({
      clientId,
      userName,
      muted,
      deafened,
      joinedAt,
    }));
  }
  return out;
}

function broadcastVoiceState() {
  broadcastToAll({ type: 'voice_channel_state', channels: getVoiceChannelState() });
}

function broadcastToAll(payload: object) {
  const msg = JSON.stringify(payload);
  for (const [, ws] of clientToWs) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

const ROLE_WEIGHT_OWNER = 0;
const ROLE_WEIGHT_GUEST = 9998;
const ROLE_WEIGHT_NON_APPROVED = 9999;

/** Returns role weight for user in server. Lower = higher privilege. Non-approved = 9999, Guest = 9998, Owner = 0. */
function getUserRoleWeight(serverId: string, username: string): number {
  const server = servers.find((s) => s.id === serverId);
  if (!server) return ROLE_WEIGHT_NON_APPROVED;
  if (isGlobalOwner(username)) return ROLE_WEIGHT_OWNER;
  const un = username.trim().toLowerCase();
  if (server.ownerId && server.ownerId.trim().toLowerCase() === un) return ROLE_WEIGHT_OWNER;
  if (hasPendingJoinRequest(serverId, username)) return ROLE_WEIGHT_NON_APPROVED;
  const isMember = Array.isArray(server.members) && server.members.some((m) => m.trim().toLowerCase() === un);
  if (!isMember) return ROLE_WEIGHT_NON_APPROVED;
  const memberRoles = server.memberRoles ?? {};
  const roleId = memberRoles[un];
  const roles = server.roles ?? [];
  const role = roles.find((r) => r.id === roleId);
  if (role) return role.weight;
  return ROLE_WEIGHT_GUEST;
}

/** True if user has Guest or better (can see chats). */
function userHasGuestOrBetter(serverId: string, username: string): boolean {
  return getUserRoleWeight(serverId, username) <= ROLE_WEIGHT_GUEST;
}

/** True if user can send messages in channel. Requires Guest+ and weight <= channel.minRoleWeight. */
function userCanSendInChannel(serverId: string, channelId: string, username: string): boolean {
  const weight = getUserRoleWeight(serverId, username);
  if (weight > ROLE_WEIGHT_GUEST) return false;
  const ch = channels.find((c) => c.id === channelId);
  if (!ch || ch.serverId !== serverId) return false;
  const threshold = ch.minRoleWeight ?? ROLE_WEIGHT_GUEST;
  return weight <= threshold;
}

function userCanAccessServer(serverId: string, username: string): boolean {
  return userHasGuestOrBetter(serverId, username);
}

function getOnlineUsernames(): string[] {
  const set = new Set<string>();
  for (const name of clientToUserName.values()) {
    if (name && name !== 'Anonymous') set.add(name);
  }
  return Array.from(set);
}

function broadcastJoinRequestsToAdmins() {
  for (const [cid, ws] of clientToWs) {
    if (ws.readyState !== 1) continue;
    const currentUser = clientToUserName.get(cid) ?? '';
    const globalOwner = isGlobalOwner(currentUser);
    const canSee = globalOwner || servers.some((s) => s.ownerId === currentUser);
    if (!canSee) continue;
    const list = getPendingJoinRequests(servers, currentUser, globalOwner);
    ws.send(JSON.stringify({ type: 'join_requests', requests: list }));
  }
}

function broadcastServersAndChannels() {
  const onlineUsers = getOnlineUsernames();
  for (const [cid, ws] of clientToWs) {
    if (ws.readyState !== 1) continue;
    const currentUser = clientToUserName.get(cid) ?? '';
    let serversWithAccess = servers.map((s) => {
      const weight = getUserRoleWeight(s.id, currentUser);
      const canAccess = weight <= ROLE_WEIGHT_GUEST;
      const canManageChannels = userCanManageChannels(s.id, currentUser);
      const members = s.members ?? [];
      const onlineMembers = members.filter((m) => onlineUsers.some((u) => u.toLowerCase() === m.toLowerCase()));
      return { ...s, canAccess: !!canAccess, canManageChannels, myRoleWeight: weight, onlineMembers };
    });
    const order = currentUser ? userServerOrder[currentUser.toLowerCase()] : undefined;
    if (order && order.length > 0) {
      serversWithAccess = [...serversWithAccess].sort((a, b) => {
        const ai = order.indexOf(a.id);
        const bi = order.indexOf(b.id);
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
    }
    const channelsSorted = [...channels].sort((a, b) => {
      if (a.serverId !== b.serverId) return a.serverId.localeCompare(b.serverId);
      return (a.position ?? 0) - (b.position ?? 0);
    });
    const avatarUsernames = Object.keys(getAvatars());
    const mainServerId = servers[0]?.id ?? '';
    ws.send(JSON.stringify({ type: 'servers_and_channels', servers: serversWithAccess, channels: channelsSorted, userColors: getNameColors(), userHasAvatar: avatarUsernames, voiceState: getVoiceChannelState(), onlineUsers, mainServerId }));
  }
}

function getOrCreateChannelMessages(channelId: string) {
  let list = messagesByChannel.get(channelId);
  if (!list) {
    list = [];
    messagesByChannel.set(channelId, list);
  }
  return list;
}

function broadcastToChannel(channelId: string, payload: object, excludeClientId?: ClientId) {
  const subs = channelSubs.get(channelId);
  if (!subs) return;
  const msg = JSON.stringify(payload);
  for (const cid of subs) {
    if (cid === excludeClientId) continue;
    const ws = clientToWs.get(cid);
    if (ws && ws.readyState === 1) ws.send(msg);
  }
}

wss.on('connection', (ws, req) => {
  const clientId = nextId();
  const clientIp = getClientIp(req as { socket?: { remoteAddress?: string }; headers?: Record<string, string | string[] | undefined> });
  clientToWs.set(clientId, ws);
  clientToUserId.set(clientId, 'anon');
  clientToUserName.set(clientId, 'Anonymous');
  clientToIp.set(clientId, clientIp);
  ws.send(JSON.stringify({ type: 'hello', clientId }));
  {
    const c = getServerConfig();
    ws.send(
      JSON.stringify({
        type: 'server_config',
        maxMessagesPerChannel: c.maxMessagesPerChannel,
        maxImageAttachmentsPerChannel: c.maxImageAttachmentsPerChannel,
      })
    );
  }

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      switch (msg.type) {
        case 'login': {
          if (isAuthRateLimited(clientIp)) {
            logSecurityEvent('auth_rate_limited', { ip: clientIp, action: 'login' });
            ws.send(JSON.stringify({ type: 'auth_error', message: 'Too many attempts. Please try again in a minute.' }));
            break;
          }
          const username = typeof msg.username === 'string' ? msg.username.trim() : '';
          const passwordSha256 = typeof msg.passwordSha256 === 'string' ? msg.passwordSha256.trim().toLowerCase() : '';
          const password = typeof msg.password === 'string' ? msg.password : '';
          const result = authLogin(username, { ip: clientIp, passwordSha256, password });
          if (result.ok && result.username) {
            clientToUserId.set(clientId, result.username);
            clientToUserName.set(clientId, result.username);
            if (result.sessionToken) clientIdToSessionToken.set(clientId, result.sessionToken);
            ws.send(JSON.stringify({ type: 'user_set', username: result.username, role: result.role, sessionToken: result.sessionToken }));
          } else {
            const payload: { type: string; message: string; lockedUntil?: number } = { type: 'auth_error', message: result.error ?? 'Login failed' };
            if (result.lockedUntil != null) payload.lockedUntil = result.lockedUntil;
            ws.send(JSON.stringify(payload));
          }
          break;
        }
        case 'register': {
          if (isAuthRateLimited(clientIp)) {
            logSecurityEvent('auth_rate_limited', { ip: clientIp, action: 'register' });
            ws.send(JSON.stringify({ type: 'auth_error', message: 'Too many attempts. Please try again in a minute.' }));
            break;
          }
          const username = typeof msg.username === 'string' ? msg.username.trim() : '';
          const passwordSha256 = typeof msg.passwordSha256 === 'string' ? msg.passwordSha256.trim().toLowerCase() : '';
          const password = typeof msg.password === 'string' ? msg.password : '';
          const securityQuestion = typeof msg.securityQuestion === 'string' ? msg.securityQuestion.trim() : '';
          const securityAnswer = typeof msg.securityAnswer === 'string' ? msg.securityAnswer : '';
          const result = authRegister(username, password, securityQuestion, securityAnswer, { ip: clientIp, passwordSha256 });
          if (result.ok && result.username) {
            clientToUserId.set(clientId, result.username);
            clientToUserName.set(clientId, result.username);
            if (result.sessionToken) clientIdToSessionToken.set(clientId, result.sessionToken);
            ws.send(JSON.stringify({ type: 'user_set', username: result.username, role: result.role, sessionToken: result.sessionToken }));
          } else {
            ws.send(JSON.stringify({ type: 'auth_error', message: result.error ?? 'Registration failed' }));
          }
          break;
        }
        case 'restore_session': {
          const token = typeof msg.token === 'string' ? msg.token : '';
          const session = restoreSession(token);
          if (session) {
            clientToUserId.set(clientId, session.username);
            clientToUserName.set(clientId, session.username);
            clientIdToSessionToken.set(clientId, token);
            ws.send(JSON.stringify({ type: 'user_set', username: session.username, role: session.role, sessionToken: token }));
          } else {
            ws.send(JSON.stringify({ type: 'auth_error', message: 'Session expired or invalid' }));
          }
          break;
        }
        case 'logout': {
          const token = typeof msg.token === 'string' ? msg.token : '';
          if (token) invalidateSession(token);
          clientIdToSessionToken.delete(clientId);
          break;
        }
        case 'set_my_name_color': {
          const currentUser = clientToUserName.get(clientId) ?? '';
          const color = typeof msg.color === 'string' ? msg.color.trim() : '';
          if (!currentUser) break;
          if (setUserNameColor(currentUser, color)) {
            broadcastToAll({ type: 'user_color_changed', username: currentUser, color: color || undefined });
          }
          break;
        }
        case 'set_my_about': {
          const currentUser = clientToUserName.get(clientId) ?? '';
          const about = typeof msg.about === 'string' ? msg.about : '';
          if (!currentUser) break;
          if (setUserAboutMe(currentUser, about)) {
            ws.send(JSON.stringify({ type: 'my_about_saved', ok: true }));
          }
          break;
        }
        case 'get_user_profile': {
          const un = typeof msg.username === 'string' ? msg.username.trim() : '';
          if (!un) break;
          const p = getPublicProfile(un);
          if (p) ws.send(JSON.stringify({ type: 'user_profile', ...p }));
          else ws.send(JSON.stringify({ type: 'user_profile', username: un, error: 'not_found' }));
          break;
        }
        case 'subscribe_channel': {
          const ch = msg.channelId;
          if (!ch) break;
          const currentUser = clientToUserName.get(clientId) ?? '';
          if (ch.startsWith('dm:')) {
            const parts = ch.split(':');
            if (parts.length !== 3 || parts[0] !== 'dm') break;
            const [u1, u2] = [parts[1], parts[2]];
            if (currentUser.toLowerCase() !== u1.toLowerCase() && currentUser.toLowerCase() !== u2.toLowerCase()) break;
            if (!areFriends(u1, u2)) break;
          } else {
            const chRecord = channels.find((c) => c.id === ch);
            if (!chRecord || !userHasGuestOrBetter(chRecord.serverId, currentUser)) break;
          }
          if (!channelSubs.has(ch)) channelSubs.set(ch, new Set());
          channelSubs.get(ch)!.add(clientId);
          const list = getOrCreateChannelMessages(ch);
          const withColors = list.map((m) => ({ ...m, authorColor: getNameColor(m.authorName) }));
          ws.send(JSON.stringify({ type: 'message_list', channelId: ch, messages: withColors }));
          break;
        }
        case 'unsubscribe_channel': {
          const ch = msg.channelId;
          if (ch) channelSubs.get(ch)?.delete(clientId);
          break;
        }
        case 'send_message': {
          const channelId = msg.channelId;
          const content = typeof msg.content === 'string' ? msg.content.trim() : '';
          const imageDataUrl = typeof msg.imageDataUrl === 'string' && msg.imageDataUrl.startsWith('data:image/') ? msg.imageDataUrl : undefined;
          const imageUrl = parseAllowedGiphyImageUrl(msg.imageUrl);
          const replyToMessageId = typeof msg.replyToMessageId === 'string' ? msg.replyToMessageId : undefined;
          if (!channelId || (!content && !imageDataUrl && !imageUrl)) break;
          if (imageDataUrl && imageDataUrl.length > 10 * 1024 * 1024) break;
          const authorName = clientToUserName.get(clientId) ?? 'Anonymous';
          if (authorName === 'Anonymous') break;
          if (channelId.startsWith('dm:')) {
            const parts = channelId.split(':');
            if (parts.length !== 3 || parts[0] !== 'dm') break;
            const [u1, u2] = [parts[1], parts[2]];
            if (authorName.toLowerCase() !== u1.toLowerCase() && authorName.toLowerCase() !== u2.toLowerCase()) break;
            if (!areFriends(u1, u2)) break;
          } else {
            const chRecord = channels.find((c) => c.id === channelId);
            if (!chRecord || !userCanSendInChannel(chRecord.serverId, channelId, authorName)) break;
          }
          const rate = checkSendMessageRate(authorName);
          if (!rate.ok) {
            ws.send(
              JSON.stringify({
                type: 'send_rate_limited',
                retryAfterMs: Math.ceil(rate.retryAfterMs ?? 5000),
              })
            );
            break;
          }
          const list = getOrCreateChannelMessages(channelId);
          const authorId = clientToUserId.get(clientId) ?? 'anon';

          let replyTo: MessageRecord['replyTo'] | undefined;
          if (replyToMessageId) {
            const replied = findMessage(channelId, replyToMessageId);
            if (replied) {
              const preview = replied.content.slice(0, 80).replace(/\n/g, ' ');
              replyTo = { messageId: replied.id, authorName: replied.authorName, contentPreview: preview };
            }
          }

          const attachment =
            imageDataUrl != null
              ? { type: 'image' as const, url: imageDataUrl }
              : imageUrl != null
                ? { type: 'image' as const, url: imageUrl }
                : undefined;
          const m: MessageRecord = {
            id: nextId(),
            channelId,
            authorId,
            authorName,
            content: content || '',
            createdAt: new Date().toISOString(),
            ...(attachment && { attachment }),
            ...(replyTo && { replyTo }),
          };
          const idsBefore = list.map((x) => x.id);
          list.push(m);
          enforceChannelRetention(list);
          const removedIds = idsBefore.filter((id) => !list.some((x) => x.id === id));
          for (const rid of removedIds) {
            broadcastToChannel(channelId, { type: 'message_deleted', channelId, messageId: rid });
          }
          persist();
          const payload = {
            type: 'new_message',
            message: {
              ...m,
              authorColor: getNameColor(authorName),
              ...(m.attachment && { attachment: m.attachment }),
            },
          };
          broadcastToChannel(channelId, payload);
          break;
        }
        case 'set_my_avatar': {
          const dataUrl = typeof msg.dataUrl === 'string' && msg.dataUrl.startsWith('data:image/') ? msg.dataUrl : undefined;
          const currentUser = clientToUserName.get(clientId) ?? '';
          if (!currentUser || currentUser === 'Anonymous' || !dataUrl) break;
          logSecurityEvent('set_my_avatar', { clientId, username: currentUser, ts: Date.now() });
          if (setUserAvatar(currentUser, dataUrl)) {
            broadcastToAll({ type: 'user_avatars_update', userHasAvatar: Object.keys(getAvatars()) });
          }
          break;
        }
        case 'add_reaction': {
          const channelId = msg.channelId;
          const messageId = msg.messageId;
          const emoji = typeof msg.emoji === 'string' ? msg.emoji.trim().slice(0, 8) : '';
          const currentUser = clientToUserName.get(clientId) ?? '';
          if (!channelId || !messageId || !emoji || !currentUser) break;
          const message = findMessage(channelId, messageId);
          if (!message) break;
          if (!message.reactions) message.reactions = {};
          if (!message.reactions[emoji]) message.reactions[emoji] = [];
          if (!message.reactions[emoji].includes(currentUser)) {
            message.reactions[emoji].push(currentUser);
            persist();
            broadcastToChannel(channelId, { type: 'reaction_updated', messageId, channelId, reactions: message.reactions });
          }
          break;
        }
        case 'remove_reaction': {
          const channelId = msg.channelId;
          const messageId = msg.messageId;
          const emoji = typeof msg.emoji === 'string' ? msg.emoji.trim().slice(0, 8) : '';
          const currentUser = clientToUserName.get(clientId) ?? '';
          if (!channelId || !messageId || !emoji || !currentUser) break;
          const message = findMessage(channelId, messageId);
          if (!message?.reactions?.[emoji]) break;
          message.reactions[emoji] = message.reactions[emoji].filter((u) => u !== currentUser);
          if (message.reactions[emoji].length === 0) delete message.reactions[emoji];
          persist();
          broadcastToChannel(channelId, { type: 'reaction_updated', messageId, channelId, reactions: message.reactions });
          break;
        }
        case 'edit_message': {
          const channelId = msg.channelId;
          const messageId = msg.messageId;
          const content = typeof msg.content === 'string' ? msg.content.trim() : '';
          const currentUser = clientToUserName.get(clientId) ?? '';
          if (!channelId || !messageId || !currentUser) break;
          const message = findMessage(channelId, messageId);
          if (!message) break;
          const ch = channels.find((c) => c.id === channelId);
          if (!ch) break;
          const isOwnMessage = message.authorName === currentUser;
          const actorWeight = getUserRoleWeight(ch.serverId, currentUser);
          const authorWeight = getUserRoleWeight(ch.serverId, message.authorName);
          const canEdit = isOwnMessage || (actorWeight < authorWeight && isServerAdmin(ch.serverId, currentUser));
          if (!canEdit) break;
          message.content = content;
          message.editedAt = new Date().toISOString();
          if (msg.imageDataUrl && typeof msg.imageDataUrl === 'string' && msg.imageDataUrl.startsWith('data:image/')) {
            message.attachment = { type: 'image', url: msg.imageDataUrl };
          } else {
            const url = parseAllowedGiphyImageUrl(msg.imageUrl);
            if (url) message.attachment = { type: 'image', url };
          }
          const listEdit = getOrCreateChannelMessages(channelId);
          const idsBeforeEdit = listEdit.map((x) => x.id);
          enforceChannelRetention(listEdit);
          const removedEdit = idsBeforeEdit.filter((id) => !listEdit.some((x) => x.id === id));
          for (const removedId of removedEdit) {
            broadcastToChannel(channelId, { type: 'message_deleted', channelId, messageId: removedId });
          }
          persist();
          const updated = findMessage(channelId, messageId);
          if (updated) {
            broadcastToChannel(channelId, {
              type: 'message_updated',
              message: { ...updated, authorColor: getNameColor(updated.authorName), ...(updated.attachment && { attachment: updated.attachment }) },
            });
          }
          break;
        }
        case 'delete_message': {
          const channelId = msg.channelId;
          const messageId = msg.messageId;
          const currentUser = clientToUserName.get(clientId) ?? '';
          if (!channelId || !messageId || !currentUser) break;
          const list = messagesByChannel.get(channelId);
          const idx = list?.findIndex((m) => m.id === messageId);
          if (idx === undefined || idx === -1) break;
          const message = list![idx];
          const ch = channels.find((c) => c.id === channelId);
          if (!ch) break;
          const isOwnMessage = message.authorName === currentUser;
          const actorWeight = getUserRoleWeight(ch.serverId, currentUser);
          const authorWeight = getUserRoleWeight(ch.serverId, message.authorName);
          const canDelete = isOwnMessage || (actorWeight < authorWeight && isServerAdmin(ch.serverId, currentUser));
          if (!canDelete) break;
          list!.splice(idx, 1);
          persist();
          broadcastToChannel(channelId, { type: 'message_deleted', channelId, messageId });
          break;
        }
        case 'join_voice': {
          const { channelId } = msg;
          if (!channelId) break;
          const currentUserJv = clientToUserName.get(clientId) ?? '';
          if (!currentUserJv) break;
          const dmVoiceParts = String(channelId).split(':');
          const isDmVoice =
            dmVoiceParts.length === 3 && dmVoiceParts[0] === 'dm-voice';
          if (isDmVoice) {
            const u1 = dmVoiceParts[1];
            const u2 = dmVoiceParts[2];
            const okUser =
              currentUserJv.toLowerCase() === u1.toLowerCase() || currentUserJv.toLowerCase() === u2.toLowerCase();
            if (!okUser || !areFriends(u1, u2)) break;
          } else {
            const chRecord = channels.find((c) => c.id === channelId && c.type === 'voice');
            if (!chRecord || !userHasGuestOrBetter(chRecord.serverId, currentUserJv)) break;
          }
          const prev = clientToVoiceChannel.get(clientId);
          if (prev) voiceChannelMembers.get(prev)?.delete(clientId);
          clientToVoiceChannel.set(clientId, channelId);
          clientToVoiceMuted.set(clientId, false);
          clientToVoiceDeafened.set(clientId, false);
          clientVoiceJoinedAt.set(clientId, Date.now());
          if (!voiceChannelMembers.has(channelId)) voiceChannelMembers.set(channelId, new Set());
          voiceChannelMembers.get(channelId)!.add(clientId);
          const members = Array.from(voiceChannelMembers.get(channelId)!);
          const memberInfo = buildVoiceMemberRowsSorted(channelId);
          for (const cid of members) {
            const w = clientToWs.get(cid);
            if (w && w.readyState === 1) {
              w.send(JSON.stringify({ type: 'voice_members', channelId, members: memberInfo }));
            }
          }
          broadcastVoiceState();
          if (isDmVoice) {
            const du1 = dmVoiceParts[1];
            const du2 = dmVoiceParts[2];
            const otherUser = currentUserJv.toLowerCase() === du1.toLowerCase() ? du2 : du1;
            const inChannel = voiceChannelMembers.get(channelId)!.size;
            if (inChannel === 1) {
              for (const [peerCid, uname] of clientToUserName) {
                if (uname.toLowerCase() !== otherUser.toLowerCase()) continue;
                if (peerCid === clientId) continue;
                const w = clientToWs.get(peerCid);
                if (w && w.readyState === 1) {
                  w.send(
                    JSON.stringify({
                      type: 'incoming_dm_voice_call',
                      channelId,
                      fromUsername: currentUserJv,
                    }),
                  );
                }
              }
            }
          }
          break;
        }
        case 'leave_voice': {
          const channelId = clientToVoiceChannel.get(clientId) ?? msg.channelId;
          if (!channelId) break;
          clientToVoiceChannel.delete(clientId);
          clientToVoiceMuted.delete(clientId);
          clientToVoiceDeafened.delete(clientId);
          clientVoiceJoinedAt.delete(clientId);
          voiceChannelMembers.get(channelId)?.delete(clientId);
          const members = Array.from(voiceChannelMembers.get(channelId) ?? []);
          const memberInfo = buildVoiceMemberRowsSorted(channelId);
          for (const cid of members) {
            const w = clientToWs.get(cid);
            if (w && w.readyState === 1) {
              w.send(JSON.stringify({ type: 'voice_members', channelId, members: memberInfo }));
            }
          }
          ws.send(JSON.stringify({ type: 'voice_members', channelId, members: memberInfo }));
          broadcastVoiceState();
          break;
        }
        case 'set_voice_muted': {
          const muted = !!msg.muted;
          clientToVoiceMuted.set(clientId, muted);
          broadcastVoiceState();
          break;
        }
        case 'set_voice_deafened': {
          const deafened = !!msg.deafened;
          clientToVoiceDeafened.set(clientId, deafened);
          broadcastVoiceState();
          break;
        }
        case 'webrtc_signal': {
          const { toClientId, signal } = msg;
          const target = clientToWs.get(toClientId);
          if (target && target.readyState === 1) {
            target.send(JSON.stringify({ type: 'webrtc_signal', fromClientId: clientId, signal }));
          }
          break;
        }
        case 'voice_activity': {
          const channelId = clientToVoiceChannel.get(clientId);
          const muted = clientToVoiceMuted.get(clientId) ?? false;
          const deafened = clientToVoiceDeafened.get(clientId) ?? false;
          const speaking = !!msg.speaking && !muted && !deafened;
          if (channelId) {
            const members = Array.from(voiceChannelMembers.get(channelId) ?? []);
            for (const cid of members) {
              if (cid === clientId) continue;
              const w = clientToWs.get(cid);
              if (w && w.readyState === 1) {
                w.send(JSON.stringify({ type: 'voice_activity', channelId, clientId, speaking }));
              }
            }
          }
          break;
        }
        case 'screen_share_ended': {
          const channelId = clientToVoiceChannel.get(clientId);
          if (channelId) {
            const members = Array.from(voiceChannelMembers.get(channelId) ?? []);
            for (const cid of members) {
              const w = clientToWs.get(cid);
              if (w && w.readyState === 1) {
                w.send(JSON.stringify({ type: 'screen_share_ended', channelId, clientId }));
              }
            }
          }
          break;
        }
        case 'get_servers_and_channels': {
          const currentUser = clientToUserName.get(clientId) ?? '';
          const onlineUsers = getOnlineUsernames();
          let serversWithAccess = servers.map((s) => {
            const weight = getUserRoleWeight(s.id, currentUser);
            const canAccess = weight <= ROLE_WEIGHT_GUEST;
            const canManageChannels = userCanManageChannels(s.id, currentUser);
            const members = s.members ?? [];
            const onlineMembers = members.filter((m) => onlineUsers.some((u) => u.toLowerCase() === m.toLowerCase()));
            return { ...s, canAccess: !!canAccess, canManageChannels, myRoleWeight: weight, onlineMembers };
          });
          const order = currentUser ? userServerOrder[currentUser.toLowerCase()] : undefined;
          if (order && order.length > 0) {
            serversWithAccess = [...serversWithAccess].sort((a, b) => {
              const ai = order.indexOf(a.id);
              const bi = order.indexOf(b.id);
              if (ai === -1 && bi === -1) return 0;
              if (ai === -1) return 1;
              if (bi === -1) return -1;
              return ai - bi;
            });
          }
          const channelsSortedGet = [...channels].sort((a, b) => {
            if (a.serverId !== b.serverId) return a.serverId.localeCompare(b.serverId);
            return (a.position ?? 0) - (b.position ?? 0);
          });
          const keysGet = Object.keys(getAvatars());
          const mainServerIdGet = servers[0]?.id ?? '';
          ws.send(JSON.stringify({ type: 'servers_and_channels', servers: serversWithAccess, channels: channelsSortedGet, userColors: getNameColors(), userHasAvatar: keysGet, voiceState: getVoiceChannelState(), onlineUsers, mainServerId: mainServerIdGet }));
          break;
        }
        case 'create_server': {
          const currentUser = clientToUserName.get(clientId) ?? '';
          if (!currentUser) break;
          if (!userCanCreateServers(currentUser)) break;
          const name = typeof msg.name === 'string' ? msg.name.trim() : '';
          if (!name) break;
          const server = {
            id: nextId(),
            name: name.slice(0, 100),
            ownerId: currentUser,
            members: currentUser ? [currentUser] : [],
            roles: [
              { id: 'owner', name: 'Owner', weight: ROLE_WEIGHT_OWNER },
              { id: 'guest', name: 'Guest', weight: ROLE_WEIGHT_GUEST },
            ],
            memberRoles: {} as Record<string, string>,
          };
          servers.push(server);
          persist();
          broadcastServersAndChannels();
          break;
        }
        case 'set_server_icon': {
          const serverId = typeof msg.serverId === 'string' ? msg.serverId.trim() : '';
          const dataUrl = typeof msg.iconUrl === 'string' ? msg.iconUrl : '';
          const currentUser = clientToUserName.get(clientId) ?? '';
          if (!serverId) break;
          const server = servers.find((s) => s.id === serverId);
          if (!server || !isServerAdmin(serverId, currentUser)) break;
          if (dataUrl && !dataUrl.startsWith('data:image/')) break;
          server.iconUrl = dataUrl || undefined;
          persist();
          broadcastServersAndChannels();
          break;
        }
        case 'add_member': {
          const serverId = msg.serverId;
          const usernameToAdd = typeof msg.username === 'string' ? msg.username.trim() : '';
          if (!serverId || !usernameToAdd) break;
          const currentUser = clientToUserName.get(clientId) ?? '';
          const server = servers.find((s) => s.id === serverId);
          if (!server) break;
          const canManage = isGlobalOwner(currentUser) || server.ownerId === currentUser;
          if (!canManage) break;
          if (!server.members) server.members = [];
          if (!server.kicked) server.kicked = [];
          if (!server.memberRoles) server.memberRoles = {};
          const lower = usernameToAdd.toLowerCase();
          server.kicked = server.kicked.filter((k) => k.toLowerCase() !== lower);
          if (!server.members.some((m) => m.toLowerCase() === lower)) {
            server.members.push(usernameToAdd);
            server.memberRoles[lower] = 'guest';
            persist();
            broadcastServersAndChannels();
          }
          break;
        }
        case 'kick_member': {
          const serverId = msg.serverId;
          const usernameToKick = typeof msg.username === 'string' ? msg.username.trim() : '';
          if (!serverId || !usernameToKick) break;
          const currentUser = clientToUserName.get(clientId) ?? '';
          const server = servers.find((s) => s.id === serverId);
          if (!server) break;
          const actorWeight = getUserRoleWeight(serverId, currentUser);
          const targetWeight = getUserRoleWeight(serverId, usernameToKick);
          if (actorWeight >= targetWeight) break;
          if (targetWeight === ROLE_WEIGHT_OWNER) break;
          if (!server.kicked) server.kicked = [];
          const lower = usernameToKick.toLowerCase();
          server.members = (server.members ?? []).filter((m) => m.toLowerCase() !== lower);
          if (!server.kicked.some((k) => k.toLowerCase() === lower)) {
            server.kicked.push(usernameToKick);
          }
          persist();
          broadcastServersAndChannels();
          break;
        }
        case 'leave_server': {
          const serverId = msg.serverId;
          if (!serverId) break;
          const currentUser = clientToUserName.get(clientId) ?? '';
          const server = servers.find((s) => s.id === serverId);
          if (!server) break;
          if (server.ownerId?.toLowerCase() === currentUser.toLowerCase()) break;
          const lower = currentUser.toLowerCase();
          if (!server.members?.some((m) => m.toLowerCase() === lower)) break;
          server.members = (server.members ?? []).filter((m) => m.toLowerCase() !== lower);
          if (!server.kicked) server.kicked = [];
          if (!server.kicked.some((k) => k.toLowerCase() === lower)) {
            server.kicked.push(currentUser);
          }
          persist();
          broadcastServersAndChannels();
          break;
        }
        case 'allow_back_member': {
          const serverId = msg.serverId;
          const usernameToAllow = typeof msg.username === 'string' ? msg.username.trim() : '';
          if (!serverId || !usernameToAllow) break;
          const currentUser = clientToUserName.get(clientId) ?? '';
          const server = servers.find((s) => s.id === serverId);
          if (!server) break;
          const canManage = isGlobalOwner(currentUser) || server.ownerId === currentUser;
          if (!canManage) break;
          const result = addJoinRequest(serverId, usernameToAllow);
          if (result.ok) {
            broadcastJoinRequestsToAdmins();
          }
          break;
        }
        case 'create_channel': {
          const currentUser = clientToUserName.get(clientId) ?? '';
          if (!currentUser) break;
          const serverId = msg.serverId;
          const name = typeof msg.name === 'string' ? msg.name.trim() : '';
          const type: 'text' | 'voice' = msg.channelType === 'voice' ? 'voice' : 'text';
          if (!serverId || !name || !servers.some((s) => s.id === serverId)) break;
          if (!userCanAccessServer(serverId, currentUser)) break;
          if (!userCanManageChannels(serverId, currentUser)) break;
          const position = channels.filter((c) => c.serverId === serverId).length;
          const channel = { id: nextId(), serverId, name: name.slice(0, 100), type, position };
          channels.push(channel);
          persist();
          broadcastServersAndChannels();
          break;
        }
        case 'rename_channel': {
          const channelId = msg.channelId;
          const name = typeof msg.name === 'string' ? msg.name.trim() : '';
          const currentUser = clientToUserName.get(clientId) ?? '';
          if (!channelId || !name) break;
          const ch = channels.find((c) => c.id === channelId);
          if (ch && !userCanAccessServer(ch.serverId, currentUser)) break;
          if (ch && !userCanManageChannels(ch.serverId, currentUser)) break;
          if (ch) {
            ch.name = name.slice(0, 100);
            persist();
            broadcastServersAndChannels();
          }
          break;
        }
        case 'delete_channel': {
          const channelId = msg.channelId;
          const currentUserDel = clientToUserName.get(clientId) ?? '';
          if (!channelId) break;
          const chDel = channels.find((c) => c.id === channelId);
          if (chDel && !userCanManageChannels(chDel.serverId, currentUserDel)) break;
          const idx = channels.findIndex((c) => c.id === channelId);
          if (idx !== -1) {
            channels.splice(idx, 1);
            messagesByChannel.delete(channelId);
            persist();
            broadcastServersAndChannels();
          }
          break;
        }
        case 'reorder_channels': {
          const serverId = typeof msg.serverId === 'string' ? msg.serverId.trim() : '';
          const channelIds = Array.isArray(msg.channelIds) ? (msg.channelIds as string[]).filter((id): id is string => typeof id === 'string') : [];
          const currentUser = clientToUserName.get(clientId) ?? '';
          if (!serverId || channelIds.length === 0 || !userCanManageChannels(serverId, currentUser)) break;
          const serverChannels = channels.filter((c) => c.serverId === serverId);
          const validIds = new Set(serverChannels.map((c) => c.id));
          const ordered = channelIds.filter((id) => validIds.has(id));
          if (ordered.length === 0) break;
          // Assign positions: ordered first (0,1,2...), then any not in list (append)
          const notInOrder = serverChannels.filter((c) => !ordered.includes(c.id));
          const finalOrder = [...ordered, ...notInOrder.map((c) => c.id)];
          for (let i = 0; i < finalOrder.length; i++) {
            const ch = channels.find((c) => c.id === finalOrder[i]);
            if (ch) ch.position = i;
          }
          persist();
          broadcastServersAndChannels();
          break;
        }
        case 'reorder_servers': {
          const serverIds = Array.isArray(msg.serverIds) ? (msg.serverIds as string[]).filter((id): id is string => typeof id === 'string') : [];
          const currentUser = clientToUserName.get(clientId) ?? '';
          if (!currentUser || serverIds.length === 0) break;
          const userServers = servers.filter((s) => (s.members ?? []).some((m) => m.toLowerCase() === currentUser.toLowerCase()));
          const validIds = new Set(userServers.map((s) => s.id));
          const ordered = serverIds.filter((id) => validIds.has(id));
          // Accept partial order: use ordered for those sent, append any member servers not in list
          const notInOrder = userServers.filter((s) => !ordered.includes(s.id)).map((s) => s.id);
          const finalOrder = ordered.length > 0 ? [...ordered, ...notInOrder] : userServers.map((s) => s.id);
          const key = currentUser.toLowerCase();
          userServerOrder = { ...userServerOrder, [key]: finalOrder };
          persist();
          broadcastServersAndChannels();
          break;
        }
        case 'set_channel_min_role': {
          const channelId = typeof msg.channelId === 'string' ? msg.channelId.trim() : '';
          const minRoleWeight = typeof msg.minRoleWeight === 'number' ? msg.minRoleWeight : undefined;
          const currentUser = clientToUserName.get(clientId) ?? '';
          if (!channelId) break;
          const ch = channels.find((c) => c.id === channelId);
          if (!ch || !isServerAdmin(ch.serverId, currentUser)) break;
          ch.minRoleWeight = minRoleWeight;
          persist();
          broadcastServersAndChannels();
          break;
        }
        case 'create_role': {
          const serverId = typeof msg.serverId === 'string' ? msg.serverId.trim() : '';
          const roleName = typeof msg.name === 'string' ? msg.name.trim().slice(0, 32) : '';
          const weight = typeof msg.weight === 'number' ? Math.max(1, Math.min(9997, msg.weight)) : 5000;
          const currentUser = clientToUserName.get(clientId) ?? '';
          const perms = msg.permissions && typeof msg.permissions === 'object' ? msg.permissions as Record<string, boolean> : {};
          if (!serverId || !roleName || !isServerAdmin(serverId, currentUser)) break;
          const server = servers.find((s) => s.id === serverId);
          if (!server) break;
          if (!server.roles) server.roles = [{ id: 'owner', name: 'Owner', weight: ROLE_WEIGHT_OWNER }, { id: 'guest', name: 'Guest', weight: ROLE_WEIGHT_GUEST }];
          const roleId = nextId();
          const permissions = {
            deleteMessages: !!perms.deleteMessages,
            manageChannels: !!perms.manageChannels,
            manageRoles: !!perms.manageRoles,
            manageMembers: !!perms.manageMembers,
            approveJoinRequests: !!perms.approveJoinRequests,
            accessAdminPanel: !!perms.accessAdminPanel,
            createServer: !!perms.createServer,
          };
          server.roles.push({ id: roleId, name: roleName, weight, permissions });
          persist();
          broadcastServersAndChannels();
          break;
        }
        case 'reorder_roles': {
          const serverId = typeof msg.serverId === 'string' ? msg.serverId.trim() : '';
          const roleIds = Array.isArray(msg.roleIds) ? (msg.roleIds as string[]).filter((id): id is string => typeof id === 'string') : [];
          const currentUser = clientToUserName.get(clientId) ?? '';
          if (!serverId || roleIds.length === 0 || !isServerAdmin(serverId, currentUser)) break;
          const server = servers.find((s) => s.id === serverId);
          if (!server || !server.roles) break;
          if (roleIds[0] !== 'owner') break;
          const hasGuest = server.roles.some((r) => r.id === 'guest');
          if (hasGuest && roleIds[roleIds.length - 1] !== 'guest') break;
          let w = 1;
          for (const rid of roleIds) {
            const r = server.roles.find((x) => x.id === rid);
            if (!r) continue;
            if (r.id === 'owner') r.weight = ROLE_WEIGHT_OWNER;
            else if (r.id === 'guest') r.weight = ROLE_WEIGHT_GUEST;
            else r.weight = w++;
          }
          persist();
          broadcastServersAndChannels();
          break;
        }
        case 'update_role_name': {
          const serverId = typeof msg.serverId === 'string' ? msg.serverId.trim() : '';
          const roleId = typeof msg.roleId === 'string' ? msg.roleId.trim() : '';
          const newName = typeof msg.name === 'string' ? msg.name.trim().slice(0, 32) : '';
          const currentUser = clientToUserName.get(clientId) ?? '';
          if (!serverId || !roleId || !newName) break;
          const server = servers.find((s) => s.id === serverId);
          if (!server || !server.roles) break;
          const role = server.roles.find((r) => r.id === roleId);
          if (!role) break;
          // Owner role can only be renamed by the server owner; other roles by any admin
          if (roleId === 'owner') {
            const isOwner = server.ownerId && server.ownerId.trim().toLowerCase() === currentUser.trim().toLowerCase();
            if (!isOwner) break;
          } else if (!isServerAdmin(serverId, currentUser)) {
            break;
          }
          role.name = newName;
          persist();
          broadcastServersAndChannels();
          break;
        }
        case 'assign_member_role': {
          const serverId = typeof msg.serverId === 'string' ? msg.serverId.trim() : '';
          const memberUsername = typeof msg.username === 'string' ? msg.username.trim() : '';
          const roleId = typeof msg.roleId === 'string' ? msg.roleId.trim() : '';
          const currentUser = clientToUserName.get(clientId) ?? '';
          if (!serverId || !memberUsername) break;
          const actorWeight = getUserRoleWeight(serverId, currentUser);
          const targetWeight = getUserRoleWeight(serverId, memberUsername);
          if (actorWeight >= targetWeight) break;
          if (targetWeight === ROLE_WEIGHT_OWNER) break;
          if (!isServerAdmin(serverId, currentUser)) break;
          const server = servers.find((s) => s.id === serverId);
          if (!server) break;
          const un = memberUsername.toLowerCase();
          const isMember = server.members?.some((m) => m.toLowerCase() === un);
          if (!isMember && server.ownerId?.toLowerCase() !== un) break;
          const roleExists = server.roles?.some((r) => r.id === roleId);
          if (!roleExists && roleId !== '') break;
          if (!server.memberRoles) server.memberRoles = {};
          if (roleId === '') delete server.memberRoles[un];
          else server.memberRoles[un] = roleId;
          persist();
          broadcastServersAndChannels();
          break;
        }
        case 'delete_server': {
          const serverId = msg.serverId;
          const currentUserServer = clientToUserName.get(clientId) ?? '';
          if (!serverId) break;
          if (!userCanAccessServer(serverId, currentUserServer)) break;
          const serverToDel = servers.find((s) => s.id === serverId);
          if (serverToDel && serverToDel.ownerId !== currentUserServer && !isGlobalOwner(currentUserServer)) break;
          const idx = servers.findIndex((s) => s.id === serverId);
          if (idx !== -1) {
            servers.splice(idx, 1);
            const toRemove = channels.filter((c) => c.serverId === serverId);
            toRemove.forEach((c) => {
              messagesByChannel.delete(c.id);
            });
            channels.splice(0, channels.length, ...channels.filter((c) => c.serverId !== serverId));
            persist();
            broadcastServersAndChannels();
          }
          break;
        }
        case 'request_password_reset': {
          if (isAuthRateLimited(clientIp)) {
            logSecurityEvent('auth_rate_limited', { ip: clientIp, action: 'request_password_reset' });
            ws.send(JSON.stringify({ type: 'auth_error', message: 'Too many attempts. Please try again in a minute.' }));
            break;
          }
          const username = typeof msg.username === 'string' ? msg.username.trim() : '';
          const securityAnswer = typeof msg.securityAnswer === 'string' ? msg.securityAnswer : '';
          const result = requestPasswordReset(username, securityAnswer, { ip: clientIp });
          if (result.ok && result.resetToken) {
            ws.send(JSON.stringify({ type: 'password_reset_token', resetToken: result.resetToken }));
          } else {
            ws.send(JSON.stringify({ type: 'auth_error', message: result.error ?? 'Reset failed' }));
          }
          break;
        }
        case 'set_new_password': {
          const token = typeof msg.resetToken === 'string' ? msg.resetToken : '';
          const newPasswordSha256 = typeof msg.newPasswordSha256 === 'string' ? msg.newPasswordSha256.trim().toLowerCase() : '';
          const newPassword = typeof msg.newPassword === 'string' ? msg.newPassword : '';
          const result = setNewPasswordWithToken(token, newPassword, { newPasswordSha256 });
          if (result.ok) {
            ws.send(JSON.stringify({ type: 'password_changed' }));
          } else {
            ws.send(JSON.stringify({ type: 'auth_error', message: result.error ?? 'Failed to set password' }));
          }
          break;
        }
        case 'change_password': {
          const currentUser = clientToUserName.get(clientId) ?? '';
          const sessionToken = clientIdToSessionToken.get(clientId);
          if (!currentUser || currentUser === 'Anonymous' || !sessionToken) {
            ws.send(JSON.stringify({ type: 'change_password_failed', message: 'Not logged in' }));
            break;
          }
          if (isAuthRateLimited(clientIp)) {
            logSecurityEvent('auth_rate_limited', { ip: clientIp, action: 'change_password' });
            ws.send(JSON.stringify({ type: 'change_password_failed', message: 'Too many attempts. Please try again in a minute.' }));
            break;
          }
          const securityAnswer = typeof msg.securityAnswer === 'string' ? msg.securityAnswer : '';
          const newPasswordSha256 = typeof msg.newPasswordSha256 === 'string' ? msg.newPasswordSha256.trim().toLowerCase() : '';
          const newPassword = typeof msg.newPassword === 'string' ? msg.newPassword : '';
          const result = changePasswordWithSecurityAnswer(currentUser, securityAnswer, newPassword, {
            newPasswordSha256,
            keepSessionToken: sessionToken,
            ip: clientIp,
          });
          if (result.ok) {
            ws.send(JSON.stringify({ type: 'password_changed', source: 'change_password' }));
          } else {
            ws.send(JSON.stringify({ type: 'change_password_failed', message: result.error ?? 'Failed to change password' }));
          }
          break;
        }
        case 'get_reset_requests': {
          const currentUser = clientToUserName.get(clientId) ?? '';
          if (!isGlobalOwner(currentUser)) break;
          const requests = getResetRequests();
          ws.send(JSON.stringify({ type: 'reset_requests', requests }));
          break;
        }
        case 'request_join_server': {
          const serverId = typeof msg.serverId === 'string' ? msg.serverId.trim() : '';
          const currentUser = clientToUserName.get(clientId) ?? '';
          if (!serverId || !currentUser) break;
          const server = servers.find((s) => s.id === serverId);
          if (!server) {
            ws.send(JSON.stringify({ type: 'join_request_result', ok: false, error: 'Server not found' }));
            break;
          }
          if (userCanAccessServer(serverId, currentUser)) {
            ws.send(JSON.stringify({ type: 'join_request_result', ok: false, error: 'You already have access' }));
            break;
          }
          const kicked = server.kicked ?? [];
          if (kicked.some((k) => k.toLowerCase() === currentUser.toLowerCase())) {
            ws.send(JSON.stringify({ type: 'join_request_result', ok: false, error: 'You were kicked from this server. Ask an admin to allow you back.' }));
            break;
          }
          const result = addJoinRequest(serverId, currentUser);
          if (result.ok) {
            ws.send(JSON.stringify({ type: 'join_request_result', ok: true }));
            broadcastJoinRequestsToAdmins();
          } else {
            ws.send(JSON.stringify({ type: 'join_request_result', ok: false, error: result.error }));
          }
          break;
        }
        case 'get_join_requests': {
          const currentUser = clientToUserName.get(clientId) ?? '';
          const globalOwner = isGlobalOwner(currentUser);
          const canSee = globalOwner || servers.some((s) => s.ownerId === currentUser);
          if (!canSee) break;
          const list = getPendingJoinRequests(servers, currentUser, globalOwner);
          ws.send(JSON.stringify({ type: 'join_requests', requests: list }));
          break;
        }
        case 'accept_join_request': {
          const requestId = typeof msg.requestId === 'string' ? msg.requestId : '';
          const currentUser = clientToUserName.get(clientId) ?? '';
          if (!requestId) break;
          const req = getJoinRequestById(requestId);
          if (!req || req.status !== 'pending') break;
          const server = servers.find((s) => s.id === req.serverId);
          if (!server) break;
          const canAccept = isGlobalOwner(currentUser) || server.ownerId === currentUser;
          if (!canAccept) break;
          setJoinRequestStatus(requestId, 'accepted');
          if (!server.members) server.members = [];
          if (!server.kicked) server.kicked = [];
          if (!server.memberRoles) server.memberRoles = {};
          const lower = req.username.toLowerCase();
          server.kicked = server.kicked.filter((k: string) => k.toLowerCase() !== lower);
          if (!server.members.some((m: string) => m.toLowerCase() === lower)) {
            server.members.push(req.username);
            server.memberRoles[lower] = 'guest';
          }
          persist();
          broadcastServersAndChannels();
          ws.send(JSON.stringify({ type: 'join_request_processed', requestId, accepted: true }));
          broadcastJoinRequestsToAdmins();
          break;
        }
        case 'decline_join_request': {
          const requestId = typeof msg.requestId === 'string' ? msg.requestId : '';
          const currentUser = clientToUserName.get(clientId) ?? '';
          if (!requestId) break;
          const req = getJoinRequestById(requestId);
          if (!req || req.status !== 'pending') break;
          const server = servers.find((s) => s.id === req.serverId);
          if (!server) break;
          const canDecline = isGlobalOwner(currentUser) || server.ownerId === currentUser;
          if (!canDecline) break;
          setJoinRequestStatus(requestId, 'declined');
          ws.send(JSON.stringify({ type: 'join_request_processed', requestId, accepted: false }));
          broadcastJoinRequestsToAdmins();
          break;
        }
        case 'get_friends_and_requests': {
          const currentUser = clientToUserName.get(clientId) ?? '';
          const friendList = getFriendsForUser(currentUser);
          const incoming = friendRequests.filter((r) => r.to.toLowerCase() === currentUser.toLowerCase());
          const lastMessageByFriend: Record<string, string> = {};
          for (const friend of friendList) {
            const key = dmKey(currentUser, friend);
            const list = messagesByChannel.get(key);
            const last = list?.length ? list[list.length - 1] : null;
            if (last) lastMessageByFriend[friend] = last.createdAt;
          }
          ws.send(JSON.stringify({
            type: 'friends_and_requests',
            friends: friendList,
            incomingRequests: incoming.map((r) => r.from),
            lastMessageByFriend,
          }));
          break;
        }
        case 'request_friend': {
          const toUsername = typeof msg.username === 'string' ? msg.username.trim() : '';
          const currentUser = clientToUserName.get(clientId) ?? '';
          if (!currentUser || !toUsername) break;
          if (currentUser.toLowerCase() === toUsername.toLowerCase()) break;
          if (areFriends(currentUser, toUsername)) break;
          const already = friendRequests.some(
            (r) => r.from.toLowerCase() === currentUser.toLowerCase() && r.to.toLowerCase() === toUsername.toLowerCase()
          );
          if (already) break;
          const pending = friendRequests.some(
            (r) => r.to.toLowerCase() === currentUser.toLowerCase() && r.from.toLowerCase() === toUsername.toLowerCase()
          );
          if (pending) break;
          friendRequests.push({ from: currentUser, to: toUsername });
          persist();
          ws.send(JSON.stringify({ type: 'friend_request_sent', ok: true }));
          break;
        }
        case 'accept_friend_request': {
          const fromUsername = typeof msg.username === 'string' ? msg.username.trim() : '';
          const currentUser = clientToUserName.get(clientId) ?? '';
          if (!fromUsername || !currentUser) break;
          const idx = friendRequests.findIndex(
            (r) => r.from.toLowerCase() === fromUsername.toLowerCase() && r.to.toLowerCase() === currentUser.toLowerCase()
          );
          if (idx === -1) break;
          friendRequests.splice(idx, 1);
          const pair: [string, string] = [fromUsername, currentUser].sort((a, b) => a.localeCompare(b)) as [string, string];
          if (!friends.some(([a, b]) => a === pair[0] && b === pair[1])) {
            friends.push(pair);
          }
          persist();
          ws.send(JSON.stringify({ type: 'friend_request_processed', username: fromUsername, accepted: true }));
          break;
        }
        case 'decline_friend_request': {
          const fromUsername = typeof msg.username === 'string' ? msg.username.trim() : '';
          const currentUser = clientToUserName.get(clientId) ?? '';
          if (!fromUsername || !currentUser) break;
          const idx = friendRequests.findIndex(
            (r) => r.from.toLowerCase() === fromUsername.toLowerCase() && r.to.toLowerCase() === currentUser.toLowerCase()
          );
          if (idx === -1) break;
          friendRequests.splice(idx, 1);
          persist();
          ws.send(JSON.stringify({ type: 'friend_request_processed', username: fromUsername, accepted: false }));
          break;
        }
        case 'create_invite': {
          const serverId = typeof msg.serverId === 'string' ? msg.serverId.trim() : '';
          const currentUser = clientToUserName.get(clientId) ?? '';
          if (!serverId || !currentUser) break;
          const server = servers.find((s) => s.id === serverId);
          if (!server) break;
          if (!isServerAdmin(serverId, currentUser)) break;
          let code = generateInviteCode();
          while (invites.some((i) => i.code === code)) code = generateInviteCode();
          invites.push({ serverId, code });
          persist();
          ws.send(JSON.stringify({ type: 'invite_created', serverId, code, link: `bahuckel://invite/${code}` }));
          break;
        }
        case 'join_by_invite': {
          const code = typeof msg.code === 'string' ? msg.code.trim().toUpperCase() : '';
          const currentUser = clientToUserName.get(clientId) ?? '';
          if (!code || !currentUser) break;
          const inv = invites.find((i) => i.code.toUpperCase() === code);
          if (!inv) {
            ws.send(JSON.stringify({ type: 'join_invite_result', ok: false, error: 'Invalid or expired invite code' }));
            break;
          }
          const server = servers.find((s) => s.id === inv.serverId);
          if (!server) break;
          if (!server.members) server.members = [];
          if (!server.memberRoles) server.memberRoles = {};
          const lower = currentUser.toLowerCase();
          if (server.members.some((m) => m.toLowerCase() === lower)) {
            ws.send(JSON.stringify({ type: 'join_invite_result', ok: true, alreadyMember: true, serverId: inv.serverId }));
            break;
          }
          if (server.kicked?.some((k) => k.toLowerCase() === lower)) {
            ws.send(JSON.stringify({ type: 'join_invite_result', ok: false, error: 'You were removed from this server' }));
            break;
          }
          server.members.push(currentUser);
          server.memberRoles[lower] = 'guest';
          persist();
          broadcastServersAndChannels();
          ws.send(JSON.stringify({ type: 'join_invite_result', ok: true, serverId: inv.serverId }));
          break;
        }
        case 'ping': {
          const t = typeof msg.t === 'number' ? msg.t : undefined;
          ws.send(JSON.stringify(t !== undefined ? { type: 'pong', t } : { type: 'pong' }));
          break;
        }
        default:
          ws.send(JSON.stringify({ type: 'pong', ...msg }));
      }
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
    }
  });

  ws.on('close', () => {
    const vc = clientToVoiceChannel.get(clientId);
    clientToWs.delete(clientId);
    clientToUserId.delete(clientId);
    clientToUserName.delete(clientId);
    clientIdToSessionToken.delete(clientId);
    clientToIp.delete(clientId);
    clientToVoiceChannel.delete(clientId);
    clientToVoiceMuted.delete(clientId);
    clientToVoiceDeafened.delete(clientId);
    clientVoiceJoinedAt.delete(clientId);
    for (const set of channelSubs.values()) set.delete(clientId);
    if (vc) {
      voiceChannelMembers.get(vc)?.delete(clientId);
      const members = Array.from(voiceChannelMembers.get(vc) ?? []);
      const memberInfo = buildVoiceMemberRowsSorted(vc);
      for (const cid of members) {
        const w = clientToWs.get(cid);
        if (w && w.readyState === 1) {
          w.send(JSON.stringify({ type: 'voice_members', channelId: vc, members: memberInfo }));
        }
      }
      broadcastVoiceState();
    }
    broadcastServersAndChannels();
  });
});

const host = '0.0.0.0';
const protocol = useHttps ? 'https' : 'http';

/** Second HTTP server: Bahuckel-themed marketing site (default port 8080). Set WEBSITE_PORT=0 to disable. */
function startPublicWebsiteServer() {
  const websitePort = Number(process.env.WEBSITE_PORT ?? 8080);
  if (!websiteRoot || !Number.isFinite(websitePort) || websitePort <= 0) {
    return;
  }
  const wApp = express();
  wApp.use(
    express.static(websiteRoot, {
      setHeaders: (res, p) => {
        const filePath = String(p);
        if (filePath.endsWith('index.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        }
      },
    }),
  );
  wApp.use((_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.sendFile(join(websiteRoot, 'index.html'));
  });
  const siteServer = createHttpServer(wApp);
  siteServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`Public site: port ${websitePort} in use — marketing site not started.`);
    } else {
      console.warn('Public site error:', err.message);
    }
  });
  siteServer.listen(websitePort, host, () => {
    console.log(`Public site at http://${host}:${websitePort} (set WEBSITE_PORT or 0 to disable)`);
  });
}

function question(rl: ReturnType<typeof createInterface>, prompt: string): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

async function ensureOwnerThenListen() {
  if (!hasGlobalOwner()) {
    const ownerUser = process.env.BAHUCKEL_OWNER_USERNAME;
    const ownerPass = process.env.BAHUCKEL_OWNER_PASSWORD;
    if (ownerUser && ownerPass) {
      createOwner(ownerUser, ownerPass);
      console.log('Owner account set from environment.');
    } else if (process.stdin.isTTY) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      console.log('No owner account found. Create one now (used to manage the server and view password reset requests).');
      const user = await question(rl, 'Owner username: ');
      const pass = await question(rl, 'Owner password: ');
      rl.close();
      if (user.trim() && pass) {
        createOwner(user.trim(), pass);
        console.log('Owner account created.');
      } else {
        console.warn('Owner not set. Set BAHUCKEL_OWNER_USERNAME and BAHUCKEL_OWNER_PASSWORD or run again to prompt.');
      }
    } else {
      console.warn('No owner account. Set BAHUCKEL_OWNER_USERNAME and BAHUCKEL_OWNER_PASSWORD to create one, or run from a terminal to create interactively.');
    }
  }
  await ensureGiphyKeyConfigured();
  function tryListen(portIndex: number) {
    if (portIndex >= PORTS_TO_TRY.length) {
      console.error('Could not bind to any port. Tried: ' + PORTS_TO_TRY.join(', '));
      process.exit(1);
    }
    const port = PORTS_TO_TRY[portIndex];
    const onError = (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
        console.warn(`Port ${port} unavailable (${err.code}), trying next...`);
        tryListen(portIndex + 1);
      } else {
        console.error(err);
        process.exit(1);
      }
    };
    httpServer.once('error', onError);
    httpServer.listen(port, host, () => {
      httpServer.removeListener('error', onError);
      startServerConfigWatcher();
      console.log(`Bahuckel at ${protocol}://0.0.0.0:${port}${clientDist ? ' (app + API)' : ''}${useHttps ? ' [HTTPS]' : ''}`);
      startPublicWebsiteServer();
    });
  }
  tryListen(0);
}

(async () => {
  await initStore();
  await ensureOwnerThenListen();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
