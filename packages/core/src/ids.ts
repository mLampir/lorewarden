const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/**
 * Picks `length` characters from `alphabet` at random, each one equally likely.
 * Uses getRandomValues, which unlike randomUUID also works on plain http in a local network.
 * Bytes at or above the largest multiple of the alphabet's length are skipped, so `byte % size`
 * favours no character.
 */
export function randomString(alphabet: string, length: number): string {
  const size = alphabet.length;
  if (size < 1 || size > 256) throw new RangeError('The alphabet needs 1 to 256 characters.');
  const limit = 256 - (256 % size);
  let text = '';
  while (text.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(Math.min(length * 2, 65_536)))) {
      if (byte >= limit) continue;
      text += alphabet[byte % size];
      if (text.length === length) break;
    }
  }
  return text;
}

/** Creates a short random id such as "scene-k3f9x2ab". */
export function createId(prefix: string): string {
  return `${prefix}-${randomString(ALPHABET, 10)}`;
}
