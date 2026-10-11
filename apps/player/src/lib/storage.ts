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

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/**
 * The id of this phone at the table. It stays the same when the player rejoins, so handouts meant
 * for them alone come back. getRandomValues also works on plain http in a local network.
 */
export function playerId(): string {
  const stored = read('lorewarden.playerId');
  if (stored) return stored;
  let id = 'player-';
  for (const byte of crypto.getRandomValues(new Uint8Array(12))) id += ALPHABET[byte % 36];
  write('lorewarden.playerId', id);
  return id;
}
