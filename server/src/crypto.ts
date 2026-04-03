/**
 * Simple AES-256-GCM encryption for message content at rest.
 * Key from BAHUCKEL_ENCRYPTION_KEY (32-byte hex) or auto-generated and stored in data dir.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { DATA_DIR } from './root.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;

const KEY_FILE = join(DATA_DIR, 'encryption.key');

function getOrCreateKey(): Buffer {
  const envKey = process.env.BAHUCKEL_ENCRYPTION_KEY;
  if (envKey && /^[0-9a-fA-F]{64}$/.test(envKey.trim())) {
    return Buffer.from(envKey.trim(), 'hex');
  }
  if (existsSync(KEY_FILE)) {
    const hex = readFileSync(KEY_FILE, 'utf-8').trim();
    if (/^[0-9a-fA-F]{64}$/.test(hex)) {
      return Buffer.from(hex, 'hex');
    }
  }
  const key = randomBytes(KEY_LENGTH);
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(KEY_FILE, key.toString('hex'), 'utf-8');
    console.warn('Bahuckel: Generated encryption key at', KEY_FILE, '- Set BAHUCKEL_ENCRYPTION_KEY for production.');
  } catch {
    console.warn('Bahuckel: Could not write encryption key file. Using in-memory key (data will not persist across restarts).');
  }
  return key;
}

let _key: Buffer | null = null;
function getKey(): Buffer {
  if (!_key) _key = getOrCreateKey();
  return _key;
}

/** Encrypt plaintext. Returns base64: iv + ciphertext + tag. */
export function encrypt(plaintext: string): string {
  if (!plaintext) return '';
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, encrypted, tag]).toString('base64');
}

/** Decrypt ciphertext (base64 iv+ciphertext+tag). Returns plaintext or empty on failure. */
export function decrypt(ciphertext: string): string {
  if (!ciphertext) return '';
  try {
    const buf = Buffer.from(ciphertext, 'base64');
    if (buf.length < IV_LENGTH + TAG_LENGTH) return ciphertext;
    const key = getKey();
    const iv = buf.subarray(0, IV_LENGTH);
    const tag = buf.subarray(buf.length - TAG_LENGTH);
    const encrypted = buf.subarray(IV_LENGTH, buf.length - TAG_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
    decipher.setAuthTag(tag);
    return decipher.update(encrypted) + decipher.final('utf8');
  } catch {
    return ciphertext;
  }
}

/** Detect if a string looks like encrypted data (base64, correct length). */
export function looksEncrypted(s: string): boolean {
  if (!s || typeof s !== 'string') return false;
  try {
    const buf = Buffer.from(s, 'base64');
    return buf.length >= IV_LENGTH + TAG_LENGTH && /^[A-Za-z0-9+/=]+$/.test(s);
  } catch {
    return false;
  }
}
