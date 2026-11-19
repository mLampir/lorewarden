import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { renameSync, writeFileSync } from 'node:fs';

// Helpers shared by the sign-in (auth.ts) and the MCP connector's OAuth (oauth.ts).

/** A random value for a token, a code or a session id: 24 bytes, URL-safe. */
export function newSecret(): string {
  return randomBytes(24).toString('base64url');
}

/** What is stored instead of a secret, so a leaked file does not give access. */
export function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Compares two secrets in constant time. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Writes a JSON file only the server's user can read. It goes to a temporary file first and is
 * then renamed, so a crash never leaves half a file behind.
 */
export function writePrivateJson(path: string, data: unknown): void {
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, path);
}
