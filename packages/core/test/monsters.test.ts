import { describe, expect, it } from 'vitest';
import {
  type Adventure,
  combatantsFromEncounter,
  createMonster,
  findMonster,
  findSrdMonster,
  Monster,
  monsterFromStatBlock,
  monsterStatBlock,
  parseAdventure,
  parseMonsterLibrary,
  resolvePoolMonster,
  serializeMonsterLibrary,
  srdMonstersForParty,
  upsertLibraryMonster,
  withLibraryMonsters,
} from '../src';
import { example, loadExample, nth } from './helpers';

/** The example adventure with its marsh eel based on an SRD monster instead of its own. */
function withSrdEel(overrides: Adventure['monsterPool'][number]['overrides'] = {}): Adventure {
  const adventure = loadExample();
  const eel = nth(adventure.monsterPool, 0);
  return {
    ...adventure,
    monsterPool: [{ ...eel, baseMonsterRef: 'srd-constrictor-snake', overrides }],
  };
}

describe('resolvePoolMonster', () => {
  it('takes values from a monster of the adventure', () => {
    const adventure = loadExample();
    const resolved = resolvePoolMonster(adventure, nth(adventure.monsterPool, 0));
    expect(resolved).toMatchObject({ name: 'Marsh Eel', hp: 16, notes: 'Flees below 5 HP.' });
    expect(resolved.base?.id).toBe('mon-reed-stalker');
    expect(resolved.statBlock).toMatchObject({ name: 'Reed Stalker', ac: 12, initiative: 2 });
    expect(resolved.statBlock?.saves).toEqual({ str: 2, dex: 2, con: 1, int: -4, wis: 1, cha: -3 });
  });

  it('takes the stat block of an SRD monster', () => {
    const adventure = withSrdEel();
    const resolved = resolvePoolMonster(adventure, nth(adventure.monsterPool, 0));
    expect(resolved.statBlock?.name).toBe('Constrictor Snake');
    expect(resolved).toMatchObject({ name: 'Marsh Eel', hp: 13, ac: 13 });
  });

  it('lets overrides win over the stat block', () => {
    const adventure = withSrdEel({ name: 'Old Eel', hp: 30 });
    const resolved = resolvePoolMonster(adventure, nth(adventure.monsterPool, 0));
    expect(resolved).toMatchObject({ name: 'Old Eel', hp: 30, ac: 13 });
  });
});

describe('SRD monsters in adventures', () => {
  it('accepts a pool monster based on an SRD monster', () => {
    const raw = JSON.parse(example);
    raw.adventure.monsterPool[0].baseMonsterRef = 'srd-goblin-warrior';
    expect(parseAdventure(JSON.stringify(raw)).ok).toBe(true);
  });

  it('rejects an SRD id that does not exist', () => {
    const raw = JSON.parse(example);
    raw.adventure.monsterPool[0].baseMonsterRef = 'srd-goblin-emperor';
    const result = parseAdventure(JSON.stringify(raw));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems).toContainEqual({
        path: 'monsterPool[0].baseMonsterRef',
        message: 'Unknown monster "srd-goblin-emperor"',
      });
    }
  });

  it('starts monsters with a stat block at their initiative score', () => {
    const combatants = combatantsFromEncounter(withSrdEel(), 'enc-causeway');
    expect(combatants[0]).toMatchObject({ initiative: 12, hp: { current: 13, max: 13 } });
  });

  it('offers only monsters that fit the party', () => {
    const low = srdMonstersForParty({ size: 4, level: 1 }).map((m) => m.id);
    expect(low).toContain('srd-goblin-warrior');
    expect(low).not.toContain('srd-adult-red-dragon');
    const high = srdMonstersForParty({ size: 5, level: 20 }).map((m) => m.id);
    expect(high).toContain('srd-ancient-red-dragon');
  });
});

describe('custom monsters', () => {
  it('copies an SRD stat block so it can be changed', () => {
    const goblin = findSrdMonster('srd-goblin-boss');
    if (!goblin) throw new Error('missing');
    const copy = monsterFromStatBlock(goblin);
    expect(copy.id).toMatch(/^monster-/);
    expect(copy.source).toMatchObject({ kind: 'srd', license: 'CC BY 4.0' });
    expect(monsterStatBlock(copy)).toEqual({ ...goblin, id: copy.id });
  });

  it('works out saves and initiative that are left out', () => {
    const monster = Monster.parse({
      ...createMonster('Bog Imp'),
      abilities: { str: 8, dex: 16, con: 12, int: 10, wis: 10, cha: 14 },
      saves: { dex: 5 },
      initiative: undefined,
    });
    const block = monsterStatBlock(monster);
    expect(block.initiative).toBe(3);
    expect(block.saves).toMatchObject({ str: -1, dex: 5, cha: 2 });
  });

  it('finds monsters of the adventure, the library and the SRD', () => {
    const adventure = loadExample();
    const own = { ...createMonster('Bog Imp'), id: 'monster-bog-imp' };
    expect(findMonster(adventure, [own], 'mon-reed-stalker')?.name).toBe('Reed Stalker');
    expect(findMonster(adventure, [own], 'monster-bog-imp')?.name).toBe('Bog Imp');
    expect(findMonster(adventure, [own], 'srd-goblin-warrior')?.name).toBe('Goblin Warrior');
    expect(findMonster(adventure, [own], 'monster-unknown')).toBeUndefined();
  });

  it('copies library monsters the pool uses into an imported adventure', () => {
    const own = { ...createMonster('Bog Imp'), id: 'monster-bog-imp' };
    const raw = JSON.parse(example);
    raw.adventure.monsterPool[0].baseMonsterRef = 'monster-bog-imp';
    expect(parseAdventure(JSON.stringify(raw)).ok).toBe(false);
    const result = parseAdventure(JSON.stringify(raw), [own]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.adventure.monsters.map((m) => m.id)).toContain('monster-bog-imp');
  });

  it('keeps the adventure as it is when it has the monster already', () => {
    const adventure = loadExample();
    const changed = { ...nth(adventure.monsters, 0), name: 'Library Stalker' };
    expect(withLibraryMonsters(adventure, [changed])).toBe(adventure);
  });
});

describe('monster library file', () => {
  it('writes and reads the library sorted by name', () => {
    const a = { ...createMonster('Zombie Heron'), id: 'monster-a' };
    const b = { ...createMonster('Bog Imp'), id: 'monster-b' };
    const { monsters, problems } = parseMonsterLibrary(serializeMonsterLibrary([a, b]));
    expect(problems).toEqual([]);
    expect(monsters.map((m) => m.name)).toEqual(['Bog Imp', 'Zombie Heron']);
  });

  it('skips a broken monster and reports it', () => {
    const good = { ...createMonster('Bog Imp'), id: 'monster-b' };
    const text = JSON.stringify({
      format: 'lorewarden.monsters',
      version: 1,
      monsters: [good, { id: 'monster-x', name: 'No CR' }],
    });
    const { monsters, problems } = parseMonsterLibrary(text);
    expect(monsters).toHaveLength(1);
    expect(problems).toHaveLength(1);
    expect(parseMonsterLibrary('nope').problems).toHaveLength(1);
  });

  it('replaces a monster with the same id', () => {
    const a = { ...createMonster('Bog Imp'), id: 'monster-a' };
    const renamed = { ...a, name: 'Fen Imp' };
    expect(upsertLibraryMonster([a], renamed)).toEqual([renamed]);
    expect(upsertLibraryMonster([a], { ...a, id: 'monster-b' })).toHaveLength(2);
  });
});
