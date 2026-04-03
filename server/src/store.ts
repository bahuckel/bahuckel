/**
 * SQLite-backed store with AES-256-GCM encryption for message content.
 * Migrates from store.json on first run if it exists.
 */
// @ts-expect-error sql.js has no types
import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import { APP_ROOT, DATA_DIR } from './root.js';
import { encrypt, decrypt, looksEncrypted } from './crypto.js';

const STORE_JSON_PATH = join(DATA_DIR, 'store.json');
const DB_PATH = join(DATA_DIR, 'store.sqlite');

export type ReplyToInfo = { messageId: string; authorName: string; contentPreview: string };

export type MessageRecord = {
  id: string;
  channelId: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
  editedAt?: string;
  attachment?: { type: 'image'; url: string };
  replyTo?: ReplyToInfo;
  reactions?: Record<string, string[]>;
};

export type RolePermissions = {
  deleteMessages?: boolean;
  manageChannels?: boolean;
  manageRoles?: boolean;
  manageMembers?: boolean;
  approveJoinRequests?: boolean;
  accessAdminPanel?: boolean;
  /** Create additional servers (Add server); first server in the instance remains the main hub. */
  createServer?: boolean;
};
export type ServerRole = { id: string; name: string; weight: number; permissions?: RolePermissions };
export type ServerRecord = {
  id: string;
  name: string;
  ownerId: string;
  members: string[];
  kicked?: string[];
  roles?: ServerRole[];
  memberRoles?: Record<string, string>;
  iconUrl?: string;
};
export type ChannelRecord = {
  id: string;
  serverId: string;
  name: string;
  type: 'text' | 'voice';
  position: number;
  minRoleWeight?: number;
};

export type FriendRequestRecord = { from: string; to: string };
export type InviteRecord = { serverId: string; code: string };

export type Store = {
  servers: ServerRecord[];
  channels: ChannelRecord[];
  messagesByChannel: Record<string, MessageRecord[]>;
  friends?: [string, string][];
  friendRequests?: FriendRequestRecord[];
  invites?: InviteRecord[];
  userServerOrder?: Record<string, string[]>;
};

const DEFAULT_ROLES: ServerRole[] = [
  { id: 'owner', name: 'Owner', weight: 0 },
  { id: 'guest', name: 'Guest', weight: 9998 },
];

let db: InstanceType<Awaited<typeof initSqlJs>['Database']> | null = null;

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function getDb(): NonNullable<typeof db> {
  if (!db) throw new Error('Store not initialized. Call loadStore first.');
  return db;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS servers (
  id TEXT PRIMARY KEY,
  name TEXT,
  owner_id TEXT,
  members TEXT,
  kicked TEXT,
  roles TEXT,
  member_roles TEXT,
  icon_url TEXT
);
CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  server_id TEXT,
  name TEXT,
  type TEXT,
  position INTEGER,
  min_role_weight INTEGER
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT,
  channel_id TEXT,
  author_id TEXT,
  author_name TEXT,
  content_enc TEXT,
  created_at TEXT,
  edited_at TEXT,
  attachment TEXT,
  reply_to TEXT,
  reactions TEXT,
  PRIMARY KEY (id, channel_id)
);
CREATE TABLE IF NOT EXISTS friends (a TEXT, b TEXT, PRIMARY KEY (a, b));
CREATE TABLE IF NOT EXISTS friend_requests (from_user TEXT, to_user TEXT, PRIMARY KEY (from_user, to_user));
CREATE TABLE IF NOT EXISTS invites (server_id TEXT, code TEXT, PRIMARY KEY (server_id, code));
CREATE TABLE IF NOT EXISTS user_server_order (username TEXT PRIMARY KEY, server_ids TEXT);
`;

function migrateFromJson(): Store | null {
  if (!existsSync(STORE_JSON_PATH)) return null;
  try {
    const raw = readFileSync(STORE_JSON_PATH, 'utf-8');
    const data = JSON.parse(raw) as Store;
    return data;
  } catch {
    return null;
  }
}

function initSchema(database: { run: (sql: string) => void }) {
  database.run(SCHEMA);
}

function rowToServer(row: Record<string, unknown>): ServerRecord {
  const members = row.members ? JSON.parse(String(row.members)) : [];
  const kicked = row.kicked ? JSON.parse(String(row.kicked)) : undefined;
  const roles = row.roles ? JSON.parse(String(row.roles)) : DEFAULT_ROLES;
  const memberRoles = row.member_roles ? JSON.parse(String(row.member_roles)) : {};
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    ownerId: String(row.owner_id ?? ''),
    members: Array.isArray(members) ? members : [],
    kicked: Array.isArray(kicked) ? kicked : undefined,
    roles: Array.isArray(roles) && roles.length > 0 ? roles : DEFAULT_ROLES,
    memberRoles: typeof memberRoles === 'object' ? memberRoles : {},
    iconUrl: row.icon_url ? String(row.icon_url) : undefined,
  };
}

function rowToChannel(row: Record<string, unknown>): ChannelRecord {
  return {
    id: String(row.id),
    serverId: String(row.server_id),
    name: String(row.name),
    type: (row.type as 'text' | 'voice') || 'text',
    position: Number(row.position) ?? 0,
    minRoleWeight: row.min_role_weight != null ? Number(row.min_role_weight) : undefined,
  };
}

function rowToMessage(row: Record<string, unknown>): MessageRecord {
  let content = String(row.content_enc ?? '');
  if (looksEncrypted(content)) content = decrypt(content);
  const msg: MessageRecord = {
    id: String(row.id),
    channelId: String(row.channel_id),
    authorId: String(row.author_id),
    authorName: String(row.author_name),
    content,
    createdAt: String(row.created_at),
  };
  if (row.edited_at) msg.editedAt = String(row.edited_at);
  if (row.attachment) {
    try {
      const att = JSON.parse(String(row.attachment));
      if (att?.type === 'image' && att?.url) msg.attachment = att;
    } catch {}
  }
  if (row.reply_to) {
    try {
      const rt = JSON.parse(String(row.reply_to));
      if (rt?.messageId) msg.replyTo = rt;
    } catch {}
  }
  if (row.reactions) {
    try {
      const r = JSON.parse(String(row.reactions));
      if (r && typeof r === 'object') msg.reactions = r;
    } catch {}
  }
  return msg;
}

/** SEA exe cannot bundle sql.js WASM; ship sql-wasm.wasm next to bahuckel-server.exe (see build-server-exe.mjs). */
function resolveSqlWasmPath(): string | undefined {
  const candidates = [
    join(APP_ROOT, 'sql-wasm.wasm'),
    join(APP_ROOT, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
    join(APP_ROOT, '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return undefined;
}

async function initSqlJsWithWasm() {
  const wasmFile = resolveSqlWasmPath();
  if (!wasmFile) {
    throw new Error(
      'sql-wasm.wasm not found. Run npm install or copy node_modules/sql.js/dist/sql-wasm.wasm next to bahuckel-server.exe.'
    );
  }
  const wasmDir = dirname(wasmFile);
  return initSqlJs({
    locateFile: (file: string) => join(wasmDir, file),
  });
}

/** Load store from SQLite. Migrates from store.json if DB is empty. */
export async function loadStore(): Promise<Store> {
  ensureDataDir();
  const SQL = await initSqlJsWithWasm();
  const dbExists = existsSync(DB_PATH);
  const fileBuffer = dbExists ? readFileSync(DB_PATH) : null;
  db = new SQL.Database(fileBuffer ? new Uint8Array(fileBuffer) : undefined);
  initSchema(db);

  const store: Store = {
    servers: [],
    channels: [],
    messagesByChannel: {},
    friends: [],
    friendRequests: [],
    invites: [],
    userServerOrder: {},
  };

  const serverRows = db.exec('SELECT * FROM servers');
  if (serverRows.length > 0 && serverRows[0].values.length > 0) {
    const cols = serverRows[0].columns;
    for (const row of serverRows[0].values) {
      const obj: Record<string, unknown> = {};
      cols.forEach((c: string, i: number) => { obj[c] = row[i]; });
      store.servers.push(rowToServer(obj));
    }
  } else {
    const jsonData = migrateFromJson();
    if (jsonData) {
      store.servers = jsonData.servers ?? [];
      store.channels = jsonData.channels ?? [];
      store.messagesByChannel = jsonData.messagesByChannel ?? {};
      store.friends = jsonData.friends ?? [];
      store.friendRequests = jsonData.friendRequests ?? [];
      store.invites = jsonData.invites ?? [];
      store.userServerOrder = jsonData.userServerOrder ?? {};
      await saveStore(store);
      try {
        renameSync(STORE_JSON_PATH, STORE_JSON_PATH + '.migrated');
      } catch {}
      console.log('Bahuckel: Migrated store from JSON to SQLite.');
      return store;
    }
  }

  const channelRows = db.exec('SELECT * FROM channels ORDER BY server_id, position');
  if (channelRows.length > 0) {
    const cols = channelRows[0].columns;
    for (const row of channelRows[0].values) {
      const obj: Record<string, unknown> = {};
      cols.forEach((c: string, i: number) => { obj[c] = row[i]; });
      store.channels.push(rowToChannel(obj));
    }
  }

  const msgRows = db.exec('SELECT * FROM messages');
  if (msgRows.length > 0) {
    const cols = msgRows[0].columns;
    for (const row of msgRows[0].values) {
      const obj: Record<string, unknown> = {};
      cols.forEach((c: string, i: number) => { obj[c] = row[i]; });
      const m = rowToMessage(obj);
      if (!store.messagesByChannel[m.channelId]) store.messagesByChannel[m.channelId] = [];
      store.messagesByChannel[m.channelId].push(m);
    }
    for (const list of Object.values(store.messagesByChannel)) {
      list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
  }

  const friendRows = db.exec('SELECT * FROM friends');
  if (friendRows.length > 0) {
    for (const row of friendRows[0].values) {
      store.friends!.push([String(row[0]), String(row[1])]);
    }
  }

  const frRows = db.exec('SELECT * FROM friend_requests');
  if (frRows.length > 0) {
    for (const row of frRows[0].values) {
      store.friendRequests!.push({ from: String(row[0]), to: String(row[1]) });
    }
  }

  const invRows = db.exec('SELECT * FROM invites');
  if (invRows.length > 0) {
    for (const row of invRows[0].values) {
      store.invites!.push({ serverId: String(row[0]), code: String(row[1]) });
    }
  }

  const usoRows = db.exec('SELECT * FROM user_server_order');
  if (usoRows.length > 0) {
    for (const row of usoRows[0].values) {
      try {
        store.userServerOrder![String(row[0])] = JSON.parse(String(row[1]));
      } catch {}
    }
  }

  return store;
}

/** Save store to SQLite. Message content is encrypted at rest. */
export async function saveStore(store: Store): Promise<void> {
  ensureDataDir();
  const database = getDb();
  database.run('DELETE FROM servers');
  database.run('DELETE FROM channels');
  database.run('DELETE FROM messages');
  database.run('DELETE FROM friends');
  database.run('DELETE FROM friend_requests');
  database.run('DELETE FROM invites');
  database.run('DELETE FROM user_server_order');

  const insServer = database.prepare(
    'INSERT INTO servers (id, name, owner_id, members, kicked, roles, member_roles, icon_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  for (const s of store.servers) {
    insServer.run([
      s.id,
      s.name,
      s.ownerId,
      JSON.stringify(s.members),
      s.kicked ? JSON.stringify(s.kicked) : null,
      s.roles ? JSON.stringify(s.roles) : JSON.stringify(DEFAULT_ROLES),
      s.memberRoles ? JSON.stringify(s.memberRoles) : '{}',
      s.iconUrl ?? null,
    ]);
  }
  insServer.free();

  const insChannel = database.prepare(
    'INSERT INTO channels (id, server_id, name, type, position, min_role_weight) VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (const c of store.channels) {
    insChannel.run([
      c.id,
      c.serverId,
      c.name,
      c.type,
      c.position,
      c.minRoleWeight ?? null,
    ]);
  }
  insChannel.free();

  const insMsg = database.prepare(
    'INSERT INTO messages (id, channel_id, author_id, author_name, content_enc, created_at, edited_at, attachment, reply_to, reactions) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  for (const [channelId, list] of Object.entries(store.messagesByChannel)) {
    for (const m of list) {
      const contentEnc = m.content ? encrypt(m.content) : '';
      insMsg.run([
        m.id,
        channelId,
        m.authorId,
        m.authorName,
        contentEnc,
        m.createdAt,
        m.editedAt ?? null,
        m.attachment ? JSON.stringify(m.attachment) : null,
        m.replyTo ? JSON.stringify(m.replyTo) : null,
        m.reactions ? JSON.stringify(m.reactions) : null,
      ]);
    }
  }
  insMsg.free();

  const insFriend = database.prepare('INSERT INTO friends (a, b) VALUES (?, ?)');
  for (const [a, b] of store.friends ?? []) {
    insFriend.run([a, b]);
  }
  insFriend.free();

  const insFR = database.prepare('INSERT INTO friend_requests (from_user, to_user) VALUES (?, ?)');
  for (const fr of store.friendRequests ?? []) {
    insFR.run([fr.from, fr.to]);
  }
  insFR.free();

  const insInv = database.prepare('INSERT INTO invites (server_id, code) VALUES (?, ?)');
  for (const inv of store.invites ?? []) {
    insInv.run([inv.serverId, inv.code]);
  }
  insInv.free();

  const insUso = database.prepare('INSERT INTO user_server_order (username, server_ids) VALUES (?, ?)');
  for (const [user, ids] of Object.entries(store.userServerOrder ?? {})) {
    insUso.run([user, JSON.stringify(ids)]);
  }
  insUso.free();

  const data = database.export();
  writeFileSync(DB_PATH, Buffer.from(data), 'binary');
}
