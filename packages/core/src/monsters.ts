import { findSrdMonster, type StatBlock, srdMonsters } from '@lorewarden/content';
import { encounterBudget, experiencePoints } from './encounter-difficulty';
import type { Adventure, Monster, PoolMonster } from './model';

export {
  ABILITIES,
  type Ability,
  abilityModifier,
  findSrdMonster,
  SRD_MONSTER_SOURCE,
  type StatBlock,
  type StatBlockFeature,
  srdMonsters,
} from '@lorewarden/content';

/** What the game master needs at the table about a creature of the monster pool. */
export interface ResolvedMonster {
  name: string;
  cr: number;
  hp?: number;
  ac?: number;
  /** Attacks of a creature without a stat block, or how they differ from it. */
  attacks?: string;
  notes?: string;
  /** Full stat block when the creature is or stands in for an SRD monster. */
  statBlock?: StatBlock;
  /** Monster of the adventure itself the creature is based on. */
  base?: Monster;
}

/**
 * Combines a pool monster with the monster it is based on: one of the adventure, or an SRD
 * monster from the library. The pool's overrides win over the base.
 */
export function resolvePoolMonster(adventure: Adventure, pool: PoolMonster): ResolvedMonster {
  const base = adventure.monsters.find((m) => m.id === pool.baseMonsterRef);
  const statBlock = base ? undefined : findSrdMonster(pool.baseMonsterRef);
  const { overrides } = pool;
  return {
    name: overrides.name ?? pool.name,
    cr: pool.cr,
    hp: overrides.hp ?? base?.hp ?? statBlock?.hp,
    ac: overrides.ac ?? base?.ac ?? statBlock?.ac,
    attacks: overrides.attacks,
    notes: overrides.notes,
    statBlock,
    base,
  };
}

/**
 * SRD monsters that fit into a high difficulty encounter for this party on their own, so the
 * list an AI chooses from stays short for low levels.
 */
export function srdMonstersForParty(party: Adventure['party']): StatBlock[] {
  const { high } = encounterBudget(party);
  return srdMonsters.filter((monster) => experiencePoints(monster.cr) <= high);
}
