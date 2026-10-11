import { describe, expect, it } from 'vitest';
import {
  type Adventure,
  combatantsFromEncounter,
  parseAdventure,
  resolvePoolMonster,
  srdMonstersForParty,
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
    expect(resolved.statBlock).toBeUndefined();
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
