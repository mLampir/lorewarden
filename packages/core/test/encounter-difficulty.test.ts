import { describe, expect, it } from 'vitest';
import {
  assessEncounter,
  copyAdventure,
  encounterBudget,
  experiencePoints,
  reviewAdventure,
} from '../src';
import { loadExample, nth } from './helpers';

describe('experiencePoints', () => {
  it('knows fractions, whole ratings and the top of the table', () => {
    expect(experiencePoints(0.25)).toBe(50);
    expect(experiencePoints(1)).toBe(200);
    expect(experiencePoints(30)).toBe(155000);
    expect(experiencePoints(31)).toBe(0);
  });
});

describe('encounterBudget', () => {
  it('multiplies the budget per character by the party size', () => {
    expect(encounterBudget({ size: 4, level: 2 })).toEqual({ low: 400, moderate: 600, high: 800 });
    expect(encounterBudget({ size: 6, level: 5 }).high).toBe(6600);
  });
});

describe('assessEncounter', () => {
  it('rates the example encounter for its party', () => {
    const adventure = loadExample();
    expect(assessEncounter(adventure, nth(adventure.encounters, 0))).toMatchObject({
      xp: 200,
      rating: 'low',
    });
  });

  it('rates the same encounter as too much for a single character', () => {
    const adventure = copyAdventure(loadExample(), 'Solo', { size: 1, level: 1 });
    expect(assessEncounter(adventure, nth(adventure.encounters, 0))?.rating).toBe('beyond');
  });

  it('does not rate encounters without monsters or under a ruleset without XP budget', () => {
    const adventure = loadExample();
    expect(assessEncounter(adventure, { id: 'enc-empty', monsters: [] })).toBeUndefined();
    adventure.ruleset = 'srd-5.1';
    expect(assessEncounter(adventure, nth(adventure.encounters, 0))).toBeUndefined();
  });
});

describe('reviewAdventure for another party', () => {
  it('flags an encounter that is too hard for a smaller party', () => {
    const adventure = copyAdventure(loadExample(), 'Solo', { size: 1, level: 1 });
    expect(reviewAdventure(adventure)).toContainEqual({
      kind: 'encounterTooHard',
      encounterId: 'enc-causeway',
      xp: 200,
      budget: 100,
    });
  });

  it('flags an encounter whose stated difficulty no longer matches', () => {
    const adventure = loadExample();
    nth(adventure.encounters, 0).difficulty = 'high';
    expect(reviewAdventure(adventure)).toContainEqual({
      kind: 'encounterDifficulty',
      encounterId: 'enc-causeway',
      stated: 'high',
      actual: 'low',
      xp: 200,
    });
  });
});
