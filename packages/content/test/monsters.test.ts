import { describe, expect, it } from 'vitest';
import { ABILITIES, abilityModifier, findSrdMonster, srdMonsters } from '../src/index';

const CHALLENGE_RATINGS = new Set([
  0,
  0.125,
  0.25,
  0.5,
  ...Array.from({ length: 30 }, (_, i) => i + 1),
]);

describe('SRD monsters', () => {
  it('has every monster of the SRD 5.2.1 once', () => {
    expect(srdMonsters.length).toBeGreaterThan(300);
    expect(new Set(srdMonsters.map((m) => m.id)).size).toBe(srdMonsters.length);
  });

  it('has complete stat blocks', () => {
    for (const monster of srdMonsters) {
      expect(monster.id, monster.name).toMatch(/^srd-[a-z0-9-]+$/);
      expect(CHALLENGE_RATINGS.has(monster.cr), monster.name).toBe(true);
      expect(monster.ac, monster.name).toBeGreaterThan(0);
      expect(monster.hp, monster.name).toBeGreaterThan(0);
      for (const ability of ABILITIES) {
        expect(monster.abilities[ability], monster.name).toBeGreaterThan(0);
        expect(typeof monster.saves[ability], monster.name).toBe('number');
      }
      const features = [...(monster.traits ?? []), ...(monster.actions ?? [])];
      for (const feature of features) {
        expect(feature.name, monster.name).not.toBe('');
        expect(feature.text, monster.name).not.toBe('');
      }
    }
  });

  it('finds a monster by id', () => {
    const goblin = findSrdMonster('srd-goblin-warrior');
    expect(goblin).toMatchObject({ name: 'Goblin Warrior', cr: 0.25, ac: 15, hp: 10 });
    expect(goblin?.bonusActions?.map((a) => a.name)).toEqual(['Nimble Escape']);
    expect(findSrdMonster('srd-nothing')).toBeUndefined();
    expect(findSrdMonster(undefined)).toBeUndefined();
  });

  it('writes usage limits into the action name', () => {
    const dragon = findSrdMonster('srd-adult-red-dragon');
    expect(dragon?.actions?.map((a) => a.name)).toContain('Fire Breath (Recharge 5–6)');
  });

  it('computes ability modifiers', () => {
    expect(abilityModifier(15)).toBe(2);
    expect(abilityModifier(8)).toBe(-1);
    expect(abilityModifier(10)).toBe(0);
  });
});
