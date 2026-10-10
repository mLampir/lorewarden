import { describe, expect, it } from 'vitest';
import { formatChallengeRating, parseChallengeRating } from '../src';

describe('challenge rating', () => {
  it('parses fractions and whole numbers', () => {
    expect(parseChallengeRating('1/8')).toBe(0.125);
    expect(parseChallengeRating(' 1/2 ')).toBe(0.5);
    expect(parseChallengeRating('0')).toBe(0);
    expect(parseChallengeRating('17')).toBe(17);
    expect(parseChallengeRating(0.25)).toBe(0.25);
  });

  it('rejects values that are not challenge ratings', () => {
    expect(parseChallengeRating('1/3')).toBeUndefined();
    expect(parseChallengeRating('31')).toBeUndefined();
    expect(parseChallengeRating('-1')).toBeUndefined();
    expect(parseChallengeRating('2.5')).toBeUndefined();
    expect(parseChallengeRating(0.3)).toBeUndefined();
  });

  it('formats fractions the way stat blocks do', () => {
    expect(formatChallengeRating(0.25)).toBe('1/4');
    expect(formatChallengeRating(3)).toBe('3');
  });
});
