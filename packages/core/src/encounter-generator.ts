import {
  ENCOUNTER_DIFFICULTIES,
  type EncounterDifficulty,
  type EncounterRating,
  encounterBudget,
  experiencePoints,
} from './encounter-difficulty';
import { createId } from './ids';
import type { Adventure, Encounter, Monster, PoolMonster } from './model';
import { type StatBlock, withLibraryMonsters } from './monsters';

export interface EncounterRequest {
  party: Adventure['party'];
  difficulty: EncounterDifficulty;
  /** Monsters to choose from, e.g. all SRD monsters of one type. */
  candidates: readonly StatBlock[];
  /** Most creatures in one fight; twice the party size by default, at most 12. */
  maxCreatures?: number;
  /** Random numbers from 0 to below 1; Math.random by default. */
  random?: () => number;
}

export interface GeneratedEncounter {
  monsters: { statBlock: StatBlock; count: number }[];
  /** Total XP of the monsters. */
  xp: number;
  /** The difficulty the total XP falls into for the party. */
  rating: EncounterRating;
}

type Shape = 'solo' | 'group' | 'leader' | 'mixed';
const SHAPES: Shape[] = ['solo', 'group', 'leader', 'mixed'];
const TRIES = 200;

/**
 * Puts together a fight of the wanted difficulty by the SRD 5.2 XP budget: its monsters are worth
 * more than the next lower difficulty allows, and at most the budget of the wanted one. It tries
 * several shapes at random: one strong creature, a group of one kind, a leader with followers and
 * a mix of two kinds. Returns undefined if no combination of the candidates fits.
 */
export function generateEncounter(request: EncounterRequest): GeneratedEncounter | undefined {
  const { party, difficulty, candidates } = request;
  const random = request.random ?? Math.random;
  const budget = encounterBudget(party);
  const max = budget[difficulty];
  const index = ENCOUNTER_DIFFICULTIES.indexOf(difficulty);
  const lower = ENCOUNTER_DIFFICULTIES[index - 1];
  // Below the lowest difficulty, half its budget is still worth a fight.
  const min = lower ? budget[lower] : Math.floor(max / 2);
  const maxCreatures = request.maxCreatures ?? Math.min(party.size * 2, 12);

  const usable = candidates.filter((m) => experiencePoints(m.cr) > 0 && xpOf(m) <= max);
  if (usable.length === 0) return undefined;

  const pick = (list: readonly StatBlock[]) => list[Math.floor(random() * list.length)];
  /** Prefers a creature of the same type as the first one, so the fight hangs together. */
  const pickLike = (list: readonly StatBlock[], first: StatBlock | undefined) => {
    const others = list.filter((m) => m !== first);
    const alike = others.filter((m) => m.type === first?.type);
    return pick(alike.length > 0 ? alike : others);
  };
  const between = (low: number, high: number) =>
    usable.filter((m) => xpOf(m) > low && xpOf(m) <= high);
  /** As many as fit into the XP, within the creature limit. */
  const fill = (monster: StatBlock, xp: number, limit: number) =>
    Math.min(Math.floor(xp / xpOf(monster)), limit);

  for (let i = 0; i < TRIES; i++) {
    const shape = SHAPES[Math.floor(random() * SHAPES.length)];
    let groups: { statBlock: StatBlock; count: number }[] = [];
    if (shape === 'solo') {
      const monster = pick(between(min, max));
      if (monster) groups = [{ statBlock: monster, count: 1 }];
    } else if (shape === 'group') {
      const monster = pick(between(0, max / 2));
      if (monster) groups = [{ statBlock: monster, count: fill(monster, max, maxCreatures) }];
    } else if (shape === 'leader') {
      const leader = pick(between(max * 0.3, max * 0.7));
      const left = max - (leader ? xpOf(leader) : 0);
      const follower = pickLike(between(0, left / 2), leader);
      if (leader && follower) {
        groups = [
          { statBlock: leader, count: 1 },
          { statBlock: follower, count: fill(follower, left, maxCreatures - 1) },
        ];
      }
    } else {
      const first = pick(between(0, max / 3));
      const second = pickLike(between(0, max / 3), first);
      if (first && second) {
        const half = fill(first, max / 2, Math.floor(maxCreatures / 2));
        const rest = max - half * xpOf(first);
        groups = [
          { statBlock: first, count: half },
          { statBlock: second, count: fill(second, rest, maxCreatures - half) },
        ];
      }
    }
    groups = groups.filter((g) => g.count > 0);
    const xp = groups.reduce((sum, g) => sum + xpOf(g.statBlock) * g.count, 0);
    if (groups.length > 0 && xp > min && xp <= max) {
      groups.sort((a, b) => b.statBlock.cr - a.statBlock.cr);
      const rating = ENCOUNTER_DIFFICULTIES.find((d) => xp <= budget[d]) ?? 'beyond';
      return { monsters: groups, xp, rating };
    }
  }
  return undefined;
}

const xpOf = (monster: StatBlock) => experiencePoints(monster.cr);

/**
 * Adds a generated fight to a scene: a creature of the monster pool for each monster, reusing one
 * that already stands for it, and an encounter built from them. Monsters of the game master's
 * library are copied into the adventure.
 */
export function addGeneratedEncounter(
  adventure: Adventure,
  sceneId: string,
  generated: GeneratedEncounter,
  difficulty: EncounterDifficulty,
  library: readonly Monster[] = [],
): { adventure: Adventure; encounterId: string } {
  const pool = [...adventure.monsterPool];
  const monsters: Encounter['monsters'] = [];
  for (const { statBlock, count } of generated.monsters) {
    let entry = pool.find(
      (p) => p.baseMonsterRef === statBlock.id && p.overrides.name === undefined,
    );
    if (entry) {
      const grown: PoolMonster = {
        ...entry,
        count: { min: entry.count.min, max: Math.max(entry.count.max, count) },
      };
      pool[pool.indexOf(entry)] = grown;
      entry = grown;
    } else {
      entry = {
        id: createId('pool'),
        name: statBlock.name,
        description: '',
        cr: statBlock.cr,
        count: { min: count, max: count },
        baseMonsterRef: statBlock.id,
        overrides: {},
        tags: [],
      };
      pool.push(entry);
    }
    monsters.push({ poolMonsterId: entry.id, count });
  }
  const encounter: Encounter = { id: createId('enc'), sceneId, monsters, difficulty };
  const next: Adventure = {
    ...adventure,
    monsterPool: pool,
    encounters: [...adventure.encounters, encounter],
    scenes: adventure.scenes.map((s) =>
      s.id === sceneId ? { ...s, encounterIds: [...s.encounterIds, encounter.id] } : s,
    ),
  };
  return { adventure: withLibraryMonsters(next, library), encounterId: encounter.id };
}

/** Removes an encounter and its place in every scene; the monster pool stays as it is. */
export function removeEncounter(adventure: Adventure, encounterId: string): Adventure {
  return {
    ...adventure,
    encounters: adventure.encounters.filter((e) => e.id !== encounterId),
    scenes: adventure.scenes.map((s) => ({
      ...s,
      encounterIds: s.encounterIds.filter((id) => id !== encounterId),
    })),
  };
}

/** Creature types among the monsters, sorted, to narrow down what the generator picks from. */
export function creatureTypes(monsters: readonly { type: string }[]): string[] {
  const types = new Set(monsters.map((m) => m.type.toLowerCase().replace(/\s*\(.*\)$/, '')));
  return [...types].sort();
}
