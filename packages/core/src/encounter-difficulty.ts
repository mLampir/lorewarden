import type { Adventure, Encounter } from './model';

export type EncounterDifficulty = 'low' | 'moderate' | 'high';

/** "beyond" means the monsters are worth more than the budget for a high difficulty encounter. */
export type EncounterRating = EncounterDifficulty | 'beyond';

export const ENCOUNTER_DIFFICULTIES: EncounterDifficulty[] = ['low', 'moderate', 'high'];

// Experience points by challenge rating, SRD 5.2.1 (CC BY 4.0).
const XP_BELOW_ONE: Record<number, number> = { 0: 10, 0.125: 25, 0.25: 50, 0.5: 100 };
const XP_FROM_ONE = [
  200, 450, 700, 1100, 1800, 2300, 2900, 3900, 5000, 5900, 7200, 8400, 10000, 11500, 13000, 15000,
  18000, 20000, 22000, 25000, 33000, 41000, 50000, 62000, 75000, 90000, 105000, 120000, 135000,
  155000,
];

// XP budget per character by party level for low, moderate and high difficulty, SRD 5.2.1 (CC BY 4.0).
const XP_BUDGET_PER_CHARACTER: [low: number, moderate: number, high: number][] = [
  [50, 75, 100],
  [100, 150, 200],
  [150, 225, 400],
  [250, 375, 500],
  [500, 750, 1100],
  [600, 1000, 1400],
  [750, 1300, 1700],
  [1000, 1700, 2100],
  [1300, 2000, 2600],
  [1600, 2300, 3100],
  [1900, 2900, 4100],
  [2200, 3700, 4700],
  [2600, 4200, 5400],
  [2900, 4900, 6200],
  [3300, 5400, 7800],
  [3800, 6100, 9800],
  [4500, 7200, 11700],
  [5000, 8700, 14200],
  [5500, 10700, 17200],
  [6400, 13200, 22000],
];

/** Experience points a creature of this challenge rating is worth; 0 for an invalid rating. */
export function experiencePoints(cr: number): number {
  return XP_BELOW_ONE[cr] ?? XP_FROM_ONE[cr - 1] ?? 0;
}

/** The most XP an encounter of each difficulty may hold for this party. */
export function encounterBudget(party: Adventure['party']): Record<EncounterDifficulty, number> {
  const level = Math.min(Math.max(Math.trunc(party.level), 1), XP_BUDGET_PER_CHARACTER.length);
  const [low, moderate, high] = XP_BUDGET_PER_CHARACTER[level - 1] ?? [0, 0, 0];
  return { low: low * party.size, moderate: moderate * party.size, high: high * party.size };
}

export interface EncounterAssessment {
  /** Total XP of the monsters in the encounter. */
  xp: number;
  budget: Record<EncounterDifficulty, number>;
  rating: EncounterRating;
}

/**
 * Rates an encounter for the adventure's party: the lowest difficulty whose budget holds all its
 * monsters. Returns undefined when there is nothing to rate or the ruleset has no XP budget.
 */
export function assessEncounter(
  adventure: Adventure,
  encounter: Encounter,
): EncounterAssessment | undefined {
  if (adventure.ruleset !== 'srd-5.2') return undefined;
  const crById = new Map(adventure.monsterPool.map((monster) => [monster.id, monster.cr]));
  let xp = 0;
  for (const { poolMonsterId, count } of encounter.monsters) {
    const cr = crById.get(poolMonsterId);
    if (cr !== undefined) xp += experiencePoints(cr) * count;
  }
  if (xp === 0) return undefined;
  const budget = encounterBudget(adventure.party);
  const rating = ENCOUNTER_DIFFICULTIES.find((difficulty) => xp <= budget[difficulty]) ?? 'beyond';
  return { xp, budget, rating };
}

export function isEncounterDifficulty(value: string | undefined): value is EncounterDifficulty {
  return ENCOUNTER_DIFFICULTIES.includes(value as EncounterDifficulty);
}
