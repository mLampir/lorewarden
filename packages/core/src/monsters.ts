import {
  ABILITIES,
  abilityModifier,
  findSrdMonster,
  SRD_MONSTER_SOURCE,
  type StatBlock,
  srdMonsters,
} from '@lorewarden/content';
import { encounterBudget, experiencePoints } from './encounter-difficulty';
import { createId } from './ids';
import { type LibraryFormat, parseLibrary, serializeLibrary, upsertById } from './library';
import { type Adventure, Monster, type Npc, type PoolMonster } from './model';

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
  /** Full stat block of the SRD monster or the adventure's own monster the creature is based on. */
  statBlock?: StatBlock;
  /** Monster of the adventure itself the creature is based on. */
  base?: Monster;
}

/** The stat block of a custom monster, with saves and initiative worked out where left out. */
export function monsterStatBlock(monster: Monster): StatBlock {
  const { abilities } = monster;
  const saves = Object.fromEntries(
    ABILITIES.map((ability) => [
      ability,
      monster.saves[ability] ?? abilityModifier(abilities[ability]),
    ]),
  ) as StatBlock['saves'];
  const optional = (value: string | undefined) => (value?.trim() ? value : undefined);
  const list = <T>(items: T[]) => (items.length > 0 ? items : undefined);
  return {
    id: monster.id,
    name: monster.name,
    size: monster.size,
    type: monster.type,
    alignment: monster.alignment,
    cr: monster.cr,
    ac: monster.ac,
    hp: monster.hp,
    hitDice: monster.hitDice,
    speed: monster.speed,
    initiative: monster.initiative ?? abilityModifier(abilities.dex),
    abilities,
    saves,
    skills: optional(monster.skills),
    vulnerabilities: optional(monster.vulnerabilities),
    resistances: optional(monster.resistances),
    immunities: optional(monster.immunities),
    senses: monster.senses,
    languages: monster.languages,
    traits: list(monster.traits),
    actions: list(monster.actions),
    bonusActions: list(monster.bonusActions),
    reactions: list(monster.reactions),
    legendaryActions: list(monster.legendaryActions),
  };
}

/** A new custom monster with plain values, to be filled in by the game master. */
export function createMonster(name: string): Monster {
  return Monster.parse({
    id: createId('monster'),
    name,
    size: 'medium',
    type: 'humanoid',
    alignment: 'neutral',
    cr: 0.25,
    ac: 12,
    hp: 11,
    hitDice: '2d8 + 2',
    senses: 'Passive Perception 10',
    languages: 'Common',
    actions: [
      {
        name: 'Strike',
        text: 'Melee Attack Roll: +3, reach 5 ft. 4 (1d6 + 1) Bludgeoning damage.',
      },
    ],
  });
}

/** A custom monster copied from an SRD stat block, so the game master can change it. */
export function monsterFromStatBlock(block: StatBlock): Monster {
  const { id: _id, saves, ...rest } = block;
  // Only saves that differ from the ability modifier are kept, so changed scores carry through.
  const proficient = Object.fromEntries(
    ABILITIES.filter((a) => saves[a] !== abilityModifier(block.abilities[a])).map((a) => [
      a,
      saves[a],
    ]),
  );
  return Monster.parse({
    ...rest,
    id: createId('monster'),
    source: {
      kind: 'srd',
      title: `${SRD_MONSTER_SOURCE.title}: ${block.name}`,
      license: SRD_MONSTER_SOURCE.license,
      url: SRD_MONSTER_SOURCE.url,
    },
    saves: proficient,
  });
}

/**
 * A monster of the adventure, the game master's library or the SRD, by id. Monsters of the
 * adventure come first, because they travel with it.
 */
export function findMonster(
  adventure: Pick<Adventure, 'monsters'> | undefined,
  library: readonly Monster[],
  id: string | undefined,
): StatBlock | undefined {
  if (id === undefined) return undefined;
  const custom = adventure?.monsters.find((m) => m.id === id) ?? library.find((m) => m.id === id);
  return custom ? monsterStatBlock(custom) : findSrdMonster(id);
}

/**
 * Copies the library monsters the monster pool is based on into the adventure, so the adventure
 * file carries every stat block it needs. Monsters the adventure already has stay as they are.
 */
export function withLibraryMonsters<T extends Pick<Adventure, 'monsters' | 'monsterPool'>>(
  adventure: T,
  library: readonly Monster[],
): T {
  const have = new Set(adventure.monsters.map((m) => m.id));
  const added: Monster[] = [];
  for (const { baseMonsterRef } of adventure.monsterPool) {
    if (baseMonsterRef === undefined || have.has(baseMonsterRef)) continue;
    const monster = library.find((m) => m.id === baseMonsterRef);
    if (!monster) continue;
    added.push(structuredClone(monster));
    have.add(monster.id);
  }
  return added.length > 0
    ? { ...adventure, monsters: [...adventure.monsters, ...added] }
    : adventure;
}

/**
 * Combines a pool monster with the monster it is based on: one of the adventure, or an SRD
 * monster from the library. The pool's overrides win over the base.
 */
export function resolvePoolMonster(adventure: Adventure, pool: PoolMonster): ResolvedMonster {
  const base = adventure.monsters.find((m) => m.id === pool.baseMonsterRef);
  const statBlock = base ? monsterStatBlock(base) : findSrdMonster(pool.baseMonsterRef);
  const { overrides } = pool;
  return {
    name: overrides.name ?? pool.name,
    cr: pool.cr,
    hp: overrides.hp ?? statBlock?.hp,
    ac: overrides.ac ?? statBlock?.ac,
    attacks: overrides.attacks,
    notes: overrides.notes,
    statBlock,
    base,
  };
}

/** The stat block of an NPC who may fight, from the pool monster the NPC points to. */
export function npcMonster(adventure: Adventure, npc: Npc): ResolvedMonster | undefined {
  const pool = adventure.monsterPool.find((m) => m.id === npc.poolMonsterId);
  return pool && resolvePoolMonster(adventure, pool);
}

/**
 * SRD monsters that fit into a high difficulty encounter for this party on their own, so the
 * list an AI chooses from stays short for low levels.
 */
export function srdMonstersForParty(party: Adventure['party']): StatBlock[] {
  return monstersForParty(srdMonsters, party);
}

/** The monsters of a list that fit into a high difficulty encounter for this party on their own. */
export function monstersForParty<T extends { cr: number }>(
  monsters: readonly T[],
  party: Adventure['party'],
): T[] {
  const { high } = encounterBudget(party);
  return monsters.filter((monster) => experiencePoints(monster.cr) <= high);
}

// --- Monster library -------------------------------------------------------------------------

const MONSTER_LIBRARY_FORMAT = 'lorewarden.monsters';
const MONSTER_LIBRARY_VERSION = 1;
/** File in the Lorewarden folder that holds the game master's own monsters. */
export const MONSTER_LIBRARY_FILE = 'monsters.json';

const MONSTER_LIBRARY: LibraryFormat<Monster> = {
  format: MONSTER_LIBRARY_FORMAT,
  version: MONSTER_LIBRARY_VERSION,
  key: 'monsters',
  entry: Monster,
  wrongFormat: 'Not a Lorewarden monster library',
};

export function serializeMonsterLibrary(monsters: readonly Monster[]): string {
  return serializeLibrary(MONSTER_LIBRARY, monsters);
}

/**
 * Reads the monster library file. A single broken monster is skipped and reported, so one typo
 * in a hand-edited file does not hide the whole library.
 */
export function parseMonsterLibrary(text: string): { monsters: Monster[]; problems: string[] } {
  const { entries, problems } = parseLibrary(MONSTER_LIBRARY, text);
  return { monsters: entries, problems };
}

/** Replaces the monster with the same id, or adds it. */
export function upsertLibraryMonster(library: readonly Monster[], monster: Monster): Monster[] {
  return upsertById(library, monster);
}
