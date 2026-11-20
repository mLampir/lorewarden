import { CONDITIONS, type Combatant } from '@lorewarden/core';

/** The name of a condition; one the game master typed in stays as it is. */
export function conditionLabel(term: (key: string) => string, key: string): string {
  return (CONDITIONS as readonly string[]).includes(key) ? term(`conditions.${key}`) : key;
}

/** At 0 hit points, or unconscious for a character whose hit points the players track. */
export function isDown(combatant: Combatant): boolean {
  return combatant.hp?.current === 0 || combatant.conditions.includes('unconscious');
}
