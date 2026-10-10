/** Challenge ratings below 1 are written as fractions in 5e stat blocks. */
const FRACTIONS: Record<string, number> = {
  '1/8': 0.125,
  '1/4': 0.25,
  '1/2': 0.5,
};

/** Parses "1/4", "5" or 0.25 into a number. Returns undefined for anything else. */
export function parseChallengeRating(input: string | number): number | undefined {
  if (typeof input === 'number') {
    return isValidChallengeRating(input) ? input : undefined;
  }
  const trimmed = input.trim();
  const fraction = FRACTIONS[trimmed];
  if (fraction !== undefined) return fraction;
  if (!/^\d+$/.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return isValidChallengeRating(value) ? value : undefined;
}

export function formatChallengeRating(cr: number): string {
  const fraction = Object.entries(FRACTIONS).find(([, value]) => value === cr);
  return fraction ? fraction[0] : String(cr);
}

export function isValidChallengeRating(cr: number): boolean {
  return Object.values(FRACTIONS).includes(cr) || (Number.isInteger(cr) && cr >= 0 && cr <= 30);
}
