// Only the ids module, so the phones do not load the whole core with its schemas.
import { randomString } from '@lorewarden/core/ids';

/** Reads a value this browser keeps for the player app, if storage is available. */
export function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Without storage the value lasts until the page is reloaded.
  }
}

/**
 * The id of this phone at the table. It stays the same when the player rejoins, so handouts meant
 * for them alone come back.
 */
export function playerId(): string {
  const stored = read('lorewarden.playerId');
  if (stored) return stored;
  const id = `player-${randomString('0123456789abcdefghijklmnopqrstuvwxyz', 12)}`;
  write('lorewarden.playerId', id);
  return id;
}
