const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/**
 * Creates a short random id such as "scene-k3f9x2ab".
 * Uses getRandomValues, which unlike randomUUID also works on plain http in a local network.
 */
export function createId(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let suffix = '';
  for (const byte of bytes) suffix += ALPHABET[byte % ALPHABET.length];
  return `${prefix}-${suffix}`;
}
