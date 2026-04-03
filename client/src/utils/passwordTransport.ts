/** SHA-256 (hex) of UTF-8 password — sent instead of plain text so DevTools shows a digest, not the secret. */

export async function sha256HexUtf8(password: string): Promise<string> {
  const data = new TextEncoder().encode(password);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
