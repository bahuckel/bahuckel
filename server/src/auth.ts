import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';

function sha256HexSync(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}
import { DATA_DIR } from './root.js';
import { encrypt, decrypt, looksEncrypted } from './crypto.js';

const USERS_PATH = join(DATA_DIR, 'users.json');
const USERS_ENC_PATH = join(DATA_DIR, 'users.json.enc');
const AVATARS_DIR = join(DATA_DIR, 'avatars');
const WHITELIST_PATH = join(DATA_DIR, 'whitelist.json');
const RESET_REQUESTS_PATH = join(DATA_DIR, 'reset_requests.json');
const SESSIONS_PATH = join(DATA_DIR, 'sessions.json');
const LOGIN_ATTEMPTS_PATH = join(DATA_DIR, 'login_attempts.json');
const SECURITY_LOG_PATH = join(DATA_DIR, 'security.log');

const SALT_ROUNDS = 10;
const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 60 * 60 * 1000; // 1 hour
const MIN_PASSWORD_LENGTH = 8;

const DEFAULT_NAME_COLOR = '#b5bac1';

export type UserRecord = {
  username: string;
  passwordHash: string;
  createdAt: string;
  role?: 'owner' | 'user';
  securityQuestion?: string;
  securityAnswerHash?: string;
  nameColor?: string;
  avatarUrl?: string;
  /** Public bio (shown on profile); max length enforced on write */
  aboutMe?: string;
};

export type ResetRequestRecord = {
  id: string;
  username: string;
  requestedAt: string;
  status: 'approved' | 'failed';
  answerMatch: boolean;
};

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadUsers(): UserRecord[] {
  ensureDataDir();
  if (existsSync(USERS_ENC_PATH)) {
    try {
      const raw = readFileSync(USERS_ENC_PATH, 'utf-8').trim();
      const plain = looksEncrypted(raw) ? decrypt(raw) : raw;
      if (plain.startsWith('{')) {
        const data = JSON.parse(plain) as { users?: UserRecord[] };
        return Array.isArray(data.users) ? data.users : [];
      }
    } catch {
      /* fall through */
    }
  }
  if (existsSync(USERS_PATH)) {
    try {
      const raw = readFileSync(USERS_PATH, 'utf-8');
      const data = JSON.parse(raw) as { users?: UserRecord[] };
      const users = Array.isArray(data.users) ? data.users : [];
      saveUsers(users);
      return users;
    } catch {
      return [];
    }
  }
  return [];
}

function saveUsers(users: UserRecord[]): void {
  ensureDataDir();
  const payload = JSON.stringify({ users }, null, 0);
  const enc = encrypt(payload);
  writeFileSync(USERS_ENC_PATH, enc, 'utf-8');
  if (existsSync(USERS_PATH)) {
    try {
      unlinkSync(USERS_PATH);
    } catch {
      /* ignore */
    }
  }
}

export function loadWhitelist(): string[] {
  ensureDataDir();
  if (!existsSync(WHITELIST_PATH)) return [];
  try {
    const raw = readFileSync(WHITELIST_PATH, 'utf-8');
    const data = JSON.parse(raw) as { usernames?: string[] };
    return Array.isArray(data.usernames) ? data.usernames : [];
  } catch {
    return [];
  }
}

function saveWhitelist(usernames: string[]): void {
  ensureDataDir();
  writeFileSync(WHITELIST_PATH, JSON.stringify({ usernames }, null, 0), 'utf-8');
}

function loadResetRequests(): ResetRequestRecord[] {
  ensureDataDir();
  if (!existsSync(RESET_REQUESTS_PATH)) return [];
  try {
    const raw = readFileSync(RESET_REQUESTS_PATH, 'utf-8');
    const data = JSON.parse(raw) as { requests?: ResetRequestRecord[] };
    return Array.isArray(data.requests) ? data.requests : [];
  } catch {
    return [];
  }
}

function saveResetRequests(requests: ResetRequestRecord[]): void {
  ensureDataDir();
  writeFileSync(RESET_REQUESTS_PATH, JSON.stringify({ requests }, null, 0), 'utf-8');
}

type LoginAttemptsStore = { attempts: Record<string, { failedCount: number; lockedUntil: number }> };

function loadLoginAttempts(): LoginAttemptsStore {
  ensureDataDir();
  if (!existsSync(LOGIN_ATTEMPTS_PATH)) return { attempts: {} };
  try {
    const raw = readFileSync(LOGIN_ATTEMPTS_PATH, 'utf-8');
    const data = JSON.parse(raw) as { attempts?: Record<string, { failedCount: number; lockedUntil: number }> };
    const attempts = data.attempts && typeof data.attempts === 'object' ? data.attempts : {};
    return { attempts };
  } catch {
    return { attempts: {} };
  }
}

function saveLoginAttempts(store: LoginAttemptsStore): void {
  ensureDataDir();
  writeFileSync(LOGIN_ATTEMPTS_PATH, JSON.stringify(store, null, 0), 'utf-8');
}

function isLockedOut(username: string): boolean {
  const lower = username.trim().toLowerCase();
  if (!lower) return false;
  const store = loadLoginAttempts();
  const entry = store.attempts[lower];
  if (!entry || !entry.lockedUntil) return false;
  if (Date.now() >= entry.lockedUntil) return false;
  return true;
}

function getLockedUntil(username: string): number | null {
  const lower = username.trim().toLowerCase();
  if (!lower) return null;
  const store = loadLoginAttempts();
  const entry = store.attempts[lower];
  if (!entry || !entry.lockedUntil || Date.now() >= entry.lockedUntil) return null;
  return entry.lockedUntil;
}

function recordFailedLogin(username: string): void {
  const lower = username.trim().toLowerCase();
  if (!lower) return;
  const store = loadLoginAttempts();
  const entry = store.attempts[lower] ?? { failedCount: 0, lockedUntil: 0 };
  entry.failedCount += 1;
  if (entry.failedCount >= MAX_FAILED_LOGIN_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
  }
  store.attempts[lower] = entry;
  saveLoginAttempts(store);
}

function clearLoginAttempts(username: string): void {
  const lower = username.trim().toLowerCase();
  if (!lower) return;
  const store = loadLoginAttempts();
  if (store.attempts[lower]) {
    delete store.attempts[lower];
    saveLoginAttempts(store);
  }
}

export function logSecurityEvent(event: string, details: Record<string, unknown>): void {
  ensureDataDir();
  try {
    const line = JSON.stringify({ ts: new Date().toISOString(), event, ...details }) + '\n';
    writeFileSync(SECURITY_LOG_PATH, line, { flag: 'a', encoding: 'utf-8' });
  } catch {
    // ignore
  }
}

function validatePassword(password: string): { ok: boolean; error?: string } {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  if (!hasLetter || !hasNumber) {
    return { ok: false, error: 'Password must contain at least one letter and one number' };
  }
  return { ok: true };
}

const resetTokens = new Map<string, { username: string; expiresAt: number }>();

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SESSION_TOKEN_BYTES = 32;
const sessions = new Map<string, { username: string; role?: string; expiresAt: number }>();

function ensureDataDirForSessions(): void {
  ensureDataDir();
}

function loadSessions(): void {
  ensureDataDirForSessions();
  if (!existsSync(SESSIONS_PATH)) return;
  try {
    const raw = readFileSync(SESSIONS_PATH, 'utf-8');
    const data = JSON.parse(raw) as { sessions?: { token: string; username: string; role?: string; expiresAt: number }[] };
    const list = Array.isArray(data.sessions) ? data.sessions : [];
    const now = Date.now();
    for (const s of list) {
      if (s && s.token && s.username && s.expiresAt > now) {
        sessions.set(s.token, { username: s.username, role: s.role, expiresAt: s.expiresAt });
      }
    }
  } catch {
    // ignore
  }
}

function saveSessions(): void {
  ensureDataDirForSessions();
  try {
    const list: { token: string; username: string; role?: string; expiresAt: number }[] = [];
    const now = Date.now();
    for (const [token, entry] of sessions) {
      if (entry.expiresAt > now) {
        list.push({ token, username: entry.username, role: entry.role, expiresAt: entry.expiresAt });
      }
    }
    writeFileSync(SESSIONS_PATH, JSON.stringify({ sessions: list }, null, 0), 'utf-8');
  } catch {
    // ignore
  }
}

function createSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString('hex');
}

export function createSession(username: string, role?: string): string {
  const token = createSessionToken();
  sessions.set(token, {
    username,
    role,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  saveSessions();
  return token;
}

export function restoreSession(token: string): { username: string; role?: string } | null {
  if (!token || typeof token !== 'string') return null;
  const entry = sessions.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    sessions.delete(token);
    saveSessions();
    return null;
  }
  return { username: entry.username, role: entry.role };
}

export function invalidateSession(token: string): void {
  if (token) {
    sessions.delete(token);
    saveSessions();
  }
}

export function invalidateAllSessionsForUser(username: string): void {
  if (!username) return;
  const lower = username.trim().toLowerCase();
  let changed = false;
  for (const [token, entry] of sessions) {
    if (entry.username.toLowerCase() === lower) {
      sessions.delete(token);
      changed = true;
    }
  }
  if (changed) saveSessions();
}

/** Invalidate all sessions for this user except one token (e.g. keep current device logged in after password change). */
export function invalidateOtherSessionsForUser(username: string, exceptToken: string): void {
  if (!username || !exceptToken) return;
  const lower = username.trim().toLowerCase();
  let changed = false;
  for (const [token, entry] of sessions) {
    if (entry.username.toLowerCase() === lower && token !== exceptToken) {
      sessions.delete(token);
      changed = true;
    }
  }
  if (changed) saveSessions();
}

loadSessions();

let usersCache: UserRecord[] = loadUsers();
let whitelistCache: string[] = loadWhitelist();
let resetRequestsCache: ResetRequestRecord[] = loadResetRequests();

function nextId(): string {
  return Date.now().toString(36) + randomBytes(4).toString('hex');
}

export function getWhitelist(): string[] {
  return [...whitelistCache];
}

export function addToWhitelist(username: string): void {
  const u = username.trim().toLowerCase();
  if (u && !whitelistCache.includes(u)) {
    whitelistCache.push(u);
    saveWhitelist(whitelistCache);
  }
}

export function removeFromWhitelist(username: string): void {
  const u = username.trim().toLowerCase();
  whitelistCache = whitelistCache.filter((x) => x !== u);
  saveWhitelist(whitelistCache);
}

export function hasGlobalOwner(): boolean {
  usersCache = loadUsers();
  return usersCache.some((u) => u.role === 'owner');
}

export function createOwner(username: string, password: string): { ok: boolean; error?: string } {
  const u = username.trim();
  const lower = u.toLowerCase();
  if (!u || u.length > 64) return { ok: false, error: 'Invalid username' };
  const pv = validatePassword(password);
  if (!pv.ok) return { ok: false, error: pv.error };
  usersCache = loadUsers();
  const existing = usersCache.find((x) => x.username.toLowerCase() === lower);
  if (existing) {
    if (existing.role === 'owner') return { ok: true };
    existing.role = 'owner';
    existing.passwordHash = bcrypt.hashSync(sha256HexSync(password), SALT_ROUNDS);
    saveUsers(usersCache);
    return { ok: true };
  }
  usersCache.push({
    username: u,
    passwordHash: bcrypt.hashSync(sha256HexSync(password), SALT_ROUNDS),
    createdAt: new Date().toISOString(),
    role: 'owner',
  });
  saveUsers(usersCache);
  if (!whitelistCache.includes(lower)) {
    whitelistCache.push(lower);
    saveWhitelist(whitelistCache);
  }
  return { ok: true };
}

export function isGlobalOwner(username: string): boolean {
  if (!username) return false;
  usersCache = loadUsers();
  const user = usersCache.find((x) => x.username.toLowerCase() === username.toLowerCase());
  return user?.role === 'owner';
}

export function register(
  username: string,
  password: string,
  securityQuestion: string,
  securityAnswer: string,
  options?: { ip?: string; passwordSha256?: string }
): { ok: boolean; username?: string; role?: string; sessionToken?: string; error?: string } {
  usersCache = loadUsers();
  const u = username.trim();
  const lower = u.toLowerCase();
  if (!u || u.length > 64) return { ok: false, error: 'Invalid username' };
  const digest = options?.passwordSha256?.trim().toLowerCase() ?? '';
  const useDigest = /^[a-f0-9]{64}$/i.test(digest);
  if (!useDigest) {
    const pv = validatePassword(password);
    if (!pv.ok) return { ok: false, error: pv.error };
  }
  const q = String(securityQuestion).trim().slice(0, 200);
  const a = String(securityAnswer).trim();
  if (!a || a.length < 2) return { ok: false, error: 'Security answer must be at least 2 characters' };
  if (usersCache.some((x) => x.username.toLowerCase() === lower)) return { ok: false, error: 'Username already taken' };
  const passwordHash = useDigest ? bcrypt.hashSync(digest, SALT_ROUNDS) : bcrypt.hashSync(password, SALT_ROUNDS);
  const securityAnswerHash = bcrypt.hashSync(a.toLowerCase(), SALT_ROUNDS);
  usersCache.push({
    username: u,
    passwordHash,
    createdAt: new Date().toISOString(),
    role: 'user',
    securityQuestion: q || undefined,
    securityAnswerHash,
  });
  saveUsers(usersCache);
  logSecurityEvent('register_success', { username: u, ip: options?.ip });
  const sessionToken = createSession(u, 'user');
  return { ok: true, username: u, role: 'user', sessionToken };
}

export function login(
  username: string,
  options?: { ip?: string; passwordSha256?: string; password?: string }
): { ok: boolean; username?: string; role?: string; sessionToken?: string; error?: string; lockedUntil?: number } {
  const u = username.trim();
  const lower = u.toLowerCase();
  if (isLockedOut(u)) {
    const lockedUntil = getLockedUntil(u) ?? Date.now() + LOCKOUT_DURATION_MS;
    logSecurityEvent('login_locked', { username: u, ip: options?.ip, lockedUntil });
    return { ok: false, error: 'Account temporarily locked due to too many failed attempts. Try again later.', lockedUntil };
  }
  const digest = options?.passwordSha256?.trim().toLowerCase() ?? '';
  const plain = typeof options?.password === 'string' ? options.password : '';
  if (!digest && !plain) {
    return { ok: false, error: 'Invalid username or password' };
  }
  usersCache = loadUsers();
  const user = usersCache.find((x) => x.username.toLowerCase() === lower);
  if (!user) {
    logSecurityEvent('login_failed', { reason: 'user_not_found', username: u, ip: options?.ip });
    return { ok: false, error: 'Invalid username or password' };
  }
  let ok = false;
  if (digest && /^[a-f0-9]{64}$/i.test(digest)) {
    ok = bcrypt.compareSync(digest, user.passwordHash);
  }
  if (!ok && plain) {
    ok = bcrypt.compareSync(plain, user.passwordHash);
    if (ok && digest && /^[a-f0-9]{64}$/i.test(digest) && sha256HexSync(plain) === digest) {
      user.passwordHash = bcrypt.hashSync(digest, SALT_ROUNDS);
      saveUsers(usersCache);
    }
  }
  if (!ok) {
    recordFailedLogin(user.username);
    const store = loadLoginAttempts();
    const entry = store.attempts[lower];
    const lockedUntil = entry?.failedCount >= MAX_FAILED_LOGIN_ATTEMPTS ? entry.lockedUntil : undefined;
    logSecurityEvent('login_failed', { reason: 'wrong_password', username: user.username, ip: options?.ip, failedCount: entry?.failedCount, lockedUntil });
    if (lockedUntil) {
      return { ok: false, error: 'Account temporarily locked due to too many failed attempts. Try again later.', lockedUntil };
    }
    return { ok: false, error: 'Invalid username or password' };
  }
  clearLoginAttempts(user.username);
  logSecurityEvent('login_success', { username: user.username, ip: options?.ip });
  const sessionToken = createSession(user.username, user.role);
  return { ok: true, username: user.username, role: user.role, sessionToken };
}

export function getNameColor(username: string): string {
  usersCache = loadUsers();
  const user = usersCache.find((x) => x.username.toLowerCase() === username.toLowerCase());
  if (!user?.nameColor) return DEFAULT_NAME_COLOR;
  return user.nameColor;
}

export function getNameColors(): Record<string, string> {
  usersCache = loadUsers();
  const out: Record<string, string> = {};
  for (const u of usersCache) {
    if (u.nameColor) out[u.username] = u.nameColor;
  }
  return out;
}

export function setUserNameColor(username: string, color: string): boolean {
  usersCache = loadUsers();
  const lower = username.trim().toLowerCase();
  const user = usersCache.find((x) => x.username.toLowerCase() === lower);
  if (!user) return false;
  const c = String(color).trim();
  user.nameColor = c && c.length <= 20 ? c : undefined;
  saveUsers(usersCache);
  return true;
}

const MAX_ABOUT_ME_LEN = 500;

export function setUserAboutMe(username: string, about: string): boolean {
  usersCache = loadUsers();
  const lower = username.trim().toLowerCase();
  const user = usersCache.find((x) => x.username.toLowerCase() === lower);
  if (!user) return false;
  const t = String(about).trim().slice(0, MAX_ABOUT_ME_LEN);
  user.aboutMe = t || undefined;
  saveUsers(usersCache);
  return true;
}

const MAX_AVATAR_SIZE = 1024 * 1024; // 1MB

function sanitizeAvatarFilename(username: string): string {
  return username.replace(/[^a-zA-Z0-9_-]/g, '_') || 'avatar';
}

function ensureAvatarsDir() {
  if (!existsSync(AVATARS_DIR)) mkdirSync(AVATARS_DIR, { recursive: true });
}

/** Avatar filename must match the username (prevents serving another user's avatar from corrupted DB). */
function avatarFilenameMatchesUser(filename: string, username: string): boolean {
  const base = sanitizeAvatarFilename(username);
  return filename === `${base}.png` || filename === `${base}.jpeg`;
}

export function hasAvatar(username: string): boolean {
  usersCache = loadUsers();
  const user = usersCache.find((x) => x.username.toLowerCase() === username.toLowerCase());
  if (!user?.avatarUrl) return false;
  if (user.avatarUrl.startsWith('data:image/')) return true;
  if (!avatarFilenameMatchesUser(user.avatarUrl, user.username)) return false;
  const path = join(AVATARS_DIR, user.avatarUrl);
  return existsSync(path);
}

export function getPublicProfile(username: string): {
  username: string;
  nameColor: string;
  aboutMe: string;
  hasAvatar: boolean;
} | null {
  usersCache = loadUsers();
  const user = usersCache.find((x) => x.username.toLowerCase() === username.toLowerCase());
  if (!user) return null;
  return {
    username: user.username,
    nameColor: getNameColor(user.username),
    aboutMe: (user.aboutMe ?? '').trim(),
    hasAvatar: hasAvatar(user.username),
  };
}

export function getAvatarPath(username: string): string | undefined {
  usersCache = loadUsers();
  const user = usersCache.find((x) => x.username.toLowerCase() === username.toLowerCase());
  if (!user?.avatarUrl) return undefined;
  if (user.avatarUrl.startsWith('data:image/')) return undefined;
  if (!avatarFilenameMatchesUser(user.avatarUrl, user.username)) return undefined;
  const fullPath = join(AVATARS_DIR, user.avatarUrl);
  return existsSync(fullPath) ? fullPath : undefined;
}

export function getAvatar(username: string): string | undefined {
  usersCache = loadUsers();
  const user = usersCache.find((x) => x.username.toLowerCase() === username.toLowerCase());
  if (!user?.avatarUrl) return undefined;
  if (user.avatarUrl.startsWith('data:image/')) return user.avatarUrl;
  if (!avatarFilenameMatchesUser(user.avatarUrl, user.username)) return undefined;
  const fullPath = join(AVATARS_DIR, user.avatarUrl);
  if (!existsSync(fullPath)) return undefined;
  try {
    const buf = readFileSync(fullPath);
    const ext = user.avatarUrl.endsWith('.png') ? 'png' : 'jpeg';
    return `data:image/${ext};base64,${buf.toString('base64')}`;
  } catch {
    return undefined;
  }
}

export function getAvatars(): Record<string, string> {
  usersCache = loadUsers();
  const out: Record<string, string> = {};
  for (const u of usersCache) {
    if (u.avatarUrl && !u.avatarUrl.startsWith('data:') && avatarFilenameMatchesUser(u.avatarUrl, u.username)) {
      const p = join(AVATARS_DIR, u.avatarUrl);
      if (existsSync(p)) out[u.username] = '1';
    }
  }
  return out;
}

export function setUserAvatar(username: string, dataUrl: string): boolean {
  usersCache = loadUsers();
  const lower = username.trim().toLowerCase();
  const user = usersCache.find((x) => x.username.toLowerCase() === lower);
  if (!user) return false;
  if (!dataUrl || !dataUrl.startsWith('data:image/')) return false;
  if (dataUrl.length > MAX_AVATAR_SIZE) return false;
  ensureAvatarsDir();
  const match = dataUrl.match(/^data:image\/(png|jpeg|webp);base64,([\s\S]+)$/i);
  if (!match) return false;
  const ext = match[1].toLowerCase() === 'png' ? 'png' : 'jpeg';
  const base64 = match[2].replace(/\s/g, '');
  let buf: Buffer;
  try {
    buf = Buffer.from(base64, 'base64');
  } catch {
    return false;
  }
  if (buf.length === 0) return false;
  const safe = sanitizeAvatarFilename(user.username);
  const filename = `${safe}.${ext}`;
  const filePath = join(AVATARS_DIR, filename);
  try {
    writeFileSync(filePath, buf);
  } catch {
    return false;
  }
  user.avatarUrl = filename;
  saveUsers(usersCache);
  return true;
}

/**
 * Nuke avatars when corrupted (base64 in users.json) or when avatar files don't match usernames.
 * After nuke, avatars persist normally - each user sets theirs in Settings.
 */
export function nukeAllAvatarsIfNeeded(): void {
  ensureDataDir();
  usersCache = loadUsers();
  const hasLegacyBase64 = usersCache.some((u) => u.avatarUrl?.startsWith('data:image/'));
  const hasMismatched = usersCache.some(
    (u) => u.avatarUrl && !u.avatarUrl.startsWith('data:') && !avatarFilenameMatchesUser(u.avatarUrl, u.username)
  );
  if (!hasLegacyBase64 && !hasMismatched) return;
  // Delete all avatar files
  if (existsSync(AVATARS_DIR)) {
    for (const f of readdirSync(AVATARS_DIR)) {
      try {
        unlinkSync(join(AVATARS_DIR, f));
      } catch { /* ignore */ }
    }
  }
  // Clear avatarUrl from every user
  let changed = false;
  for (const u of usersCache) {
    if (u.avatarUrl) {
      delete u.avatarUrl;
      changed = true;
    }
  }
  if (changed) saveUsers(usersCache);
}

export function requestPasswordReset(
  username: string,
  securityAnswer: string,
  options?: { ip?: string }
): { ok: boolean; resetToken?: string; error?: string } {
  usersCache = loadUsers();
  resetRequestsCache = loadResetRequests();
  const u = username.trim();
  const lower = u.toLowerCase();
  const user = usersCache.find((x) => x.username.toLowerCase() === lower);
  const requestedAt = new Date().toISOString();
  const id = nextId();
  if (!user) {
    resetRequestsCache.push({ id, username: u, requestedAt, status: 'failed', answerMatch: false });
    saveResetRequests(resetRequestsCache);
    logSecurityEvent('password_reset_request_failed', { reason: 'user_not_found', username: u, ip: options?.ip });
    return { ok: false, error: 'User not found' };
  }
  if (!user.securityAnswerHash) {
    resetRequestsCache.push({ id, username: user.username, requestedAt, status: 'failed', answerMatch: false });
    saveResetRequests(resetRequestsCache);
    logSecurityEvent('password_reset_request_failed', { reason: 'no_security_question', username: user.username, ip: options?.ip });
    return { ok: false, error: 'No security question set for this account' };
  }
  const answerMatch = bcrypt.compareSync(securityAnswer.toLowerCase(), user.securityAnswerHash);
  if (answerMatch) {
    const token = randomBytes(RESET_TOKEN_BYTES).toString('hex');
    resetTokens.set(token, { username: user.username, expiresAt: Date.now() + RESET_TOKEN_TTL_MS });
    resetRequestsCache.push({ id, username: user.username, requestedAt, status: 'approved', answerMatch: true });
    saveResetRequests(resetRequestsCache);
    logSecurityEvent('password_reset_request_success', { username: user.username, ip: options?.ip });
    return { ok: true, resetToken: token };
  }
  resetRequestsCache.push({ id, username: user.username, requestedAt, status: 'failed', answerMatch: false });
  saveResetRequests(resetRequestsCache);
  logSecurityEvent('password_reset_request_failed', { reason: 'wrong_answer', username: user.username, ip: options?.ip });
  return { ok: false, error: 'Security answer does not match' };
}

/** Change password while authenticated; verifies security answer. Keeps `keepSessionToken` valid, invalidates other sessions. */
export function changePasswordWithSecurityAnswer(
  username: string,
  securityAnswer: string,
  newPassword: string,
  opts?: { newPasswordSha256?: string; keepSessionToken?: string; ip?: string }
): { ok: boolean; error?: string } {
  usersCache = loadUsers();
  const u = username.trim();
  const lower = u.toLowerCase();
  const user = usersCache.find((x) => x.username.toLowerCase() === lower);
  if (!user) {
    logSecurityEvent('password_change_failed', { reason: 'user_not_found', username: u, ip: opts?.ip });
    return { ok: false, error: 'User not found' };
  }
  if (!user.securityAnswerHash) {
    logSecurityEvent('password_change_failed', { reason: 'no_security_question', username: user.username, ip: opts?.ip });
    return { ok: false, error: 'No security question set for this account' };
  }
  const answerMatch = bcrypt.compareSync(securityAnswer.toLowerCase(), user.securityAnswerHash);
  if (!answerMatch) {
    logSecurityEvent('password_change_failed', { reason: 'wrong_answer', username: user.username, ip: opts?.ip });
    return { ok: false, error: 'Security answer does not match' };
  }
  const digest = opts?.newPasswordSha256?.trim().toLowerCase() ?? '';
  const useDigest = /^[a-f0-9]{64}$/i.test(digest);
  if (!useDigest) {
    const pv = validatePassword(newPassword);
    if (!pv.ok) return { ok: false, error: pv.error };
  }
  user.passwordHash = useDigest ? bcrypt.hashSync(digest, SALT_ROUNDS) : bcrypt.hashSync(newPassword, SALT_ROUNDS);
  saveUsers(usersCache);
  if (opts?.keepSessionToken) {
    invalidateOtherSessionsForUser(user.username, opts.keepSessionToken);
  } else {
    invalidateAllSessionsForUser(user.username);
  }
  logSecurityEvent('password_change_success', { username: user.username, ip: opts?.ip });
  return { ok: true };
}

export function setNewPasswordWithToken(
  token: string,
  newPassword: string,
  opts?: { newPasswordSha256?: string }
): { ok: boolean; error?: string } {
  const entry = resetTokens.get(token);
  if (!entry) return { ok: false, error: 'Invalid or expired reset link' };
  if (Date.now() > entry.expiresAt) {
    resetTokens.delete(token);
    return { ok: false, error: 'Reset link has expired' };
  }
  const digest = opts?.newPasswordSha256?.trim().toLowerCase() ?? '';
  const useDigest = /^[a-f0-9]{64}$/i.test(digest);
  if (!useDigest) {
    const pv = validatePassword(newPassword);
    if (!pv.ok) return { ok: false, error: pv.error };
  }
  usersCache = loadUsers();
  const user = usersCache.find((x) => x.username === entry.username);
  if (!user) return { ok: false, error: 'User not found' };
  user.passwordHash = useDigest ? bcrypt.hashSync(digest, SALT_ROUNDS) : bcrypt.hashSync(newPassword, SALT_ROUNDS);
  saveUsers(usersCache);
  resetTokens.delete(token);
  invalidateAllSessionsForUser(user.username);
  logSecurityEvent('password_reset_success', { username: user.username });
  return { ok: true };
}

export function getResetRequests(): ResetRequestRecord[] {
  resetRequestsCache = loadResetRequests();
  return [...resetRequestsCache].reverse();
}
