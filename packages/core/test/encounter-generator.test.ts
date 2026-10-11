import { describe, expect, it } from 'vitest';
import {
  addGeneratedEncounter,
  checkIntegrity,
  createMonster,
  creatureTypes,
  ENCOUNTER_DIFFICULTIES,
  encounterBudget,
  findSrdMonster,
  generateEncounter,
  monsterStatBlock,
  removeEncounter,
  srdMonsters,
} from '../src';
import { loadExample, nth } from './helpers';

/** A predictable stand-in for Math.random. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 2 ** 32;
    return state / 2 ** 32;
  };
}

const party = { size: 4, level: 3 };

describe('generateEncounter', () => {
  it('stays inside the budget of the wanted difficulty', () => {
    const budget = encounterBudget(party);
    for (const [i, difficulty] of ENCOUNTER_DIFFICULTIES.entries()) {
      for (let seed = 1; seed <= 25; seed++) {
        const result = generateEncounter({
          party,
          difficulty,
          candidates: srdMonsters,
          random: seeded(seed),
        });
        if (!result) throw new Error(`Nothing for ${difficulty}`);
        expect(result.rating).toBe(difficulty);
        expect(result.xp).toBeLessThanOrEqual(budget[difficulty]);
        const lower = ENCOUNTER_DIFFICULTIES[i - 1];
        expect(result.xp).toBeGreaterThan(lower ? budget[lower] : budget.low / 2);
        const creatures = result.monsters.reduce((sum, m) => sum + m.count, 0);
        expect(creatures).toBeLessThanOrEqual(8);
      }
    }
  });

  it('picks only from the candidates', () => {
    const undead = srdMonsters.filter((m) => m.type === 'undead');
    const result = generateEncounter({
      party,
      difficulty: 'moderate',
      candidates: undead,
      random: seeded(7),
    });
    for (const { statBlock } of result?.monsters ?? []) expect(statBlock.type).toBe('undead');
  });

  it('gives up when nothing fits', () => {
    const dragon = findSrdMonster('srd-adult-red-dragon');
    if (!dragon) throw new Error('missing');
    expect(
      generateEncounter({ party, difficulty: 'low', candidates: [dragon], random: seeded(1) }),
    ).toBeUndefined();
  });
});

describe('addGeneratedEncounter', () => {
  it('adds pool monsters and an encounter to the scene', () => {
    const adventure = loadExample();
    const scene = nth(adventure.scenes, 0);
    const goblin = findSrdMonster('srd-goblin-warrior');
    const own = { ...createMonster('Bog Imp'), id: 'monster-bog-imp' };
    if (!goblin) throw new Error('missing');
    const { adventure: next, encounterId } = addGeneratedEncounter(
      adventure,
      scene.id,
      {
        monsters: [
          { statBlock: monsterStatBlock(own), count: 1 },
          { statBlock: goblin, count: 3 },
        ],
        xp: 300,
        rating: 'moderate',
      },
      'moderate',
      [own],
    );
    expect(checkIntegrity(next)).toEqual([]);
    const encounter = next.encounters.find((e) => e.id === encounterId);
    expect(encounter).toMatchObject({ sceneId: scene.id, difficulty: 'moderate' });
    expect(next.scenes[0]?.encounterIds).toContain(encounterId);
    expect(next.monsters.map((m) => m.id)).toContain('monster-bog-imp');
    const goblins = next.monsterPool.find((p) => p.baseMonsterRef === 'srd-goblin-warrior');
    expect(goblins?.count).toEqual({ min: 3, max: 3 });

    // A second fight with the same creature reuses its pool entry.
    const again = addGeneratedEncounter(
      next,
      scene.id,
      { monsters: [{ statBlock: goblin, count: 5 }], xp: 250, rating: 'low' },
      'low',
    ).adventure;
    expect(again.monsterPool.filter((p) => p.baseMonsterRef === goblin.id)).toHaveLength(1);
    expect(again.monsterPool.find((p) => p.baseMonsterRef === goblin.id)?.count.max).toBe(5);

    const removed = removeEncounter(again, encounterId);
    expect(removed.encounters).toHaveLength(again.encounters.length - 1);
    expect(removed.scenes[0]?.encounterIds).not.toContain(encounterId);
  });
});

describe('creatureTypes', () => {
  it('lists every type once', () => {
    expect(creatureTypes([{ type: 'Undead' }, { type: 'undead' }, { type: 'beast' }])).toEqual([
      'beast',
      'undead',
    ]);
  });
});
