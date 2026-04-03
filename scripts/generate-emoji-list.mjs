/**
 * Fetch Unicode 14 emoji-test.txt and derive Twemoji-style codepoint list.
 * Twemoji 14 aligns with Unicode 14. Run: node scripts/generate-emoji-list.mjs
 * Writes client/src/emojiTwemojiSupported.json for allowlist rendering.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, '..', 'client', 'src', 'emojiTwemojiSupported.json');
const EMOJI_TEST_URL = 'https://unicode.org/Public/emoji/14.0/emoji-test.txt';

const res = await fetch(EMOJI_TEST_URL);
if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
const text = await res.text();
const codepoints = [];
for (const line of text.split('\n')) {
  const semi = line.indexOf(';');
  if (semi === -1) continue;
  const status = line.slice(semi + 1, line.indexOf('#')).trim();
  if (status !== 'fully-qualified' && status !== 'minimally-qualified') continue;
  const hexPart = line.slice(0, semi).trim();
  if (!hexPart) continue;
  const cp = hexPart.split(/\s+/).map((h) => h.toLowerCase()).join('-');
  if (cp) codepoints.push(cp);
}
codepoints.sort();
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(codepoints), 'utf8');
console.log('Wrote', codepoints.length, 'codepoints to', outPath);
