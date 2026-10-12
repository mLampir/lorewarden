import { describe, expect, it } from 'vitest';
import {
  addCombatants,
  adjustHp,
  type Combatant,
  combatantsFromEncounter,
  createCombatant,
  endCombat,
  initiativeDie,
  nextTurn,
  parseDice,
  previousTurn,
  removeCombatant,
  rollD20,
  rollDice,
  rollInitiative,
  type Session,
  setInitiative,
  startCombat,
  toggleCondition,
} from '../src';
import { loadExample, nth } from './helpers';

function session(): Session {
  return {
    id: 's',
    adventureId: 'a',
    startedAt: '2026-01-01T18:00:00.000Z',
    log: [],
    initiative: [],
    players: [],
    revealed: [],
    foundClueIds: [],
    solvedPuzzleIds: [],
    firedMechanicIds: [],
  };
}

const pc = (name: string, initiative: number) => createCombatant({ name, kind: 'pc', initiative });
const names = (s: Session) => s.initiative.map((c: Combatant) => c.name);
const active = (s: Session) => (s.combat ? s.initiative[s.combat.turn]?.name : undefined);

describe('initiative order', () => {
  it('sorts by initiative and keeps ties in the order they were added', () => {
    const s = addCombatants(session(), [pc('A', 10), pc('B', 15), pc('C', 10), pc('D', 3)]);
    expect(names(s)).toEqual(['B', 'A', 'C', 'D']);
  });

  it('keeps the turn on the same combatant when someone joins or changes initiative', () => {
    let s = addCombatants(session(), [pc('A', 10), pc('B', 5)]);
    s = nextTurn(startCombat(s));
    expect(active(s)).toBe('B');
    s = addCombatants(s, [pc('C', 20)]);
    expect(active(s)).toBe('B');
    s = setInitiative(s, nth(s.initiative, 2).id, 25);
    expect(names(s)).toEqual(['B', 'C', 'A']);
    expect(active(s)).toBe('B');
  });
});

describe('turns and rounds', () => {
  it('advances turns and wraps into the next round', () => {
    let s = startCombat(addCombatants(session(), [pc('A', 10), pc('B', 5)]));
    expect(s.combat).toEqual({ round: 1, turn: 0 });
    s = nextTurn(nextTurn(s));
    expect(s.combat).toEqual({ round: 2, turn: 0 });
    s = previousTurn(s);
    expect(s.combat).toEqual({ round: 1, turn: 1 });
    s = previousTurn(previousTurn(s));
    expect(s.combat).toEqual({ round: 1, turn: 0 });
  });

  it('does not start a combat without combatants', () => {
    expect(startCombat(session()).combat).toBeUndefined();
  });

  it('passes the turn on when the active combatant is removed', () => {
    let s = startCombat(addCombatants(session(), [pc('A', 10), pc('B', 5), pc('C', 1)]));
    s = nextTurn(s);
    s = removeCombatant(s, nth(s.initiative, 1).id);
    expect(active(s)).toBe('C');
    s = removeCombatant(s, nth(s.initiative, 1).id);
    expect(active(s)).toBe('A');
    expect(s.combat?.round).toBe(2);
    s = removeCombatant(s, nth(s.initiative, 0).id);
    expect(s.combat).toBeUndefined();
  });

  it('keeps the active combatant when someone earlier in the order leaves', () => {
    let s = startCombat(addCombatants(session(), [pc('A', 10), pc('B', 5)]));
    s = nextTurn(s);
    s = removeCombatant(s, nth(s.initiative, 0).id);
    expect(active(s)).toBe('B');
  });

  it('keeps only player characters, without conditions, after combat', () => {
    let s = addCombatants(session(), [
      pc('A', 10),
      createCombatant({ name: 'Eel', kind: 'monster', initiative: 12, hp: 9 }),
    ]);
    s = toggleCondition(startCombat(s), nth(s.initiative, 1).id, 'prone');
    s = endCombat(s);
    expect(names(s)).toEqual(['A']);
    expect(s.initiative[0]?.conditions).toEqual([]);
    expect(s.combat).toBeUndefined();
  });
});

describe('hit points and conditions', () => {
  it('clamps hit points between 0 and the maximum', () => {
    let s = addCombatants(session(), [
      createCombatant({ name: 'Eel', kind: 'monster', initiative: 1, hp: 10 }),
    ]);
    const id = nth(s.initiative, 0).id;
    s = adjustHp(s, id, -4);
    expect(s.initiative[0]?.hp).toEqual({ current: 6, max: 10 });
    s = adjustHp(s, id, -20);
    expect(s.initiative[0]?.hp?.current).toBe(0);
    s = adjustHp(s, id, 50);
    expect(s.initiative[0]?.hp?.current).toBe(10);
  });

  it('toggles conditions on and off', () => {
    let s = addCombatants(session(), [pc('A', 1)]);
    const id = nth(s.initiative, 0).id;
    s = toggleCondition(s, id, 'prone');
    s = toggleCondition(s, id, 'poisoned');
    expect(s.initiative[0]?.conditions).toEqual(['prone', 'poisoned']);
    s = toggleCondition(s, id, 'prone');
    expect(s.initiative[0]?.conditions).toEqual(['poisoned']);
  });
});

describe('combatantsFromEncounter', () => {
  it('numbers monsters and takes hit points from the stand-in monster', () => {
    const combatants = combatantsFromEncounter(loadExample(), 'enc-causeway');
    expect(combatants.map((c) => c.name)).toEqual(['Marsh Eel 1', 'Marsh Eel 2']);
    expect(combatants[0]).toMatchObject({
      kind: 'monster',
      hp: { current: 16, max: 16 },
      ref: 'pool-marsh-eel',
    });
  });

  it('returns nothing for an unknown encounter', () => {
    expect(combatantsFromEncounter(loadExample(), 'missing')).toEqual([]);
  });

  it('rolls hit points for groups from the hit dice', () => {
    const faces = [0, 0.99, 0.5, 0.5, 0, 0];
    let i = 0;
    const combatants = combatantsFromEncounter(loadExample(), 'enc-causeway', {
      rollHitPoints: true,
      random: () => faces[i++ % faces.length] ?? 0,
    });
    expect(combatants.map((c) => c.hp?.max)).toEqual([
      1 + 8 + 5 + 3, // 3d8 + 3: faces 1, 8 and 5
      5 + 1 + 1 + 3,
    ]);
  });

  it('keeps the average for a single monster and hit points set by hand', () => {
    const adventure = loadExample();
    const encounter = nth(adventure.encounters, 0);
    encounter.monsters = [{ poolMonsterId: 'pool-marsh-eel', count: 1 }];
    const [single] = combatantsFromEncounter(adventure, encounter.id, { rollHitPoints: true });
    expect(single?.hp?.max).toBe(16);
    encounter.monsters = [{ poolMonsterId: 'pool-marsh-eel', count: 2, hp: 30 }];
    const pair = combatantsFromEncounter(adventure, encounter.id, { rollHitPoints: true });
    expect(pair.map((c) => c.hp?.max)).toEqual([30, 30]);
  });

  it('gives individual monsters their name, description and hit points', () => {
    const adventure = loadExample();
    const encounter = nth(adventure.encounters, 0);
    encounter.monsters = [
      {
        poolMonsterId: 'pool-marsh-eel',
        count: 1,
        name: 'Old Scarback',
        description: 'Huge, one eye clouded',
        hp: 24,
      },
      { poolMonsterId: 'pool-marsh-eel', count: 2, name: 'Elver' },
    ];
    const combatants = combatantsFromEncounter(adventure, encounter.id);
    expect(combatants.map((c) => c.name)).toEqual(['Old Scarback', 'Elver 1', 'Elver 2']);
    expect(combatants[0]).toMatchObject({
      description: 'Huge, one eye clouded',
      hp: { current: 24, max: 24 },
    });
    expect(combatants[1]?.description).toBeUndefined();
  });
});

describe('dice', () => {
  it('reads hit dice as stat blocks write them', () => {
    expect(parseDice('2d6')).toEqual({ count: 2, sides: 6, bonus: 0 });
    expect(parseDice('5d8 + 5')).toEqual({ count: 5, sides: 8, bonus: 5 });
    expect(parseDice('3d8 − 3')).toEqual({ count: 3, sides: 8, bonus: -3 });
    expect(parseDice('')).toBeUndefined();
    expect(parseDice('lots')).toBeUndefined();
  });

  it('never rolls fewer than 1 hit point', () => {
    expect(rollDice({ count: 1, sides: 4, bonus: -5 }, () => 0)).toBe(1);
  });
});

describe('rollInitiative', () => {
  /** Returns the given d20 faces one after another. */
  const dice = (...faces: number[]) => {
    let i = 0;
    return () => ((faces[i++] ?? 1) - 1) / 20;
  };
  const monster = (name: string, bonus: number, ref = 'pool-a') =>
    createCombatant({
      name,
      kind: 'monster',
      initiative: 10 + bonus,
      initiativeBonus: bonus,
      initiativeSource: 'score',
      ref,
    });

  it('rolls d20 faces from 1 to 20', () => {
    expect(rollD20(() => 0)).toBe(1);
    expect(rollD20(() => 0.999999)).toBe(20);
  });

  it('rolls d20 plus the bonus for monsters and NPCs, not for player characters', () => {
    const npc = createCombatant({ name: 'Guide', kind: 'npc', initiative: 0 });
    const start = addCombatants(session(), [pc('Hero', 12), monster('Goblin', 2), npc]);
    const s = rollInitiative(start, { random: dice(17, 5) });
    expect(s.initiative.map((c) => [c.name, c.initiative])).toEqual([
      ['Goblin', 19],
      ['Hero', 12],
      ['Guide', 5],
    ]);
    expect(initiativeDie(nth(s.initiative, 0))).toBe(17);
    expect(initiativeDie(nth(s.initiative, 1))).toBeUndefined();
  });

  it('leaves typed and already rolled values alone unless asked for by id', () => {
    let s = addCombatants(session(), [monster('A', 0), monster('B', 0), monster('C', 0)]);
    const [a, b] = s.initiative.map((c) => c.id);
    s = setInitiative(s, a as string, 4);
    s = rollInitiative(s, { ids: [b as string], random: dice(8) });
    s = rollInitiative(s, { random: dice(20) });
    expect(s.initiative.map((c) => [c.name, c.initiative])).toEqual([
      ['C', 20],
      ['B', 8],
      ['A', 4],
    ]);
    s = rollInitiative(s, { ids: [a as string], random: dice(15) });
    expect(names(s)).toEqual(['C', 'A', 'B']);
  });

  it('lets monsters from the same pool entry share one roll', () => {
    const s = rollInitiative(
      addCombatants(session(), [
        monster('Goblin 1', 2),
        monster('Goblin 2', 2),
        monster('Wolf', 1, 'pool-b'),
      ]),
      { shareRolls: true, random: dice(6, 11) },
    );
    expect(s.initiative.map((c) => [c.name, c.initiative])).toEqual([
      ['Wolf', 12],
      ['Goblin 1', 8],
      ['Goblin 2', 8],
    ]);
  });

  it('lets later monsters join the roll of their group when asked to', () => {
    const options = { shareRolls: true, joinExistingRolls: true };
    let s = rollInitiative(addCombatants(session(), [monster('Goblin 1', 2)]), {
      ...options,
      random: dice(6),
    });
    const late = [monster('Goblin 2', 2), monster('Wolf', 1, 'pool-b')];
    s = rollInitiative(addCombatants(s, late), {
      ...options,
      ids: late.map((c) => c.id),
      random: dice(11),
    });
    expect(s.initiative.map((c) => [c.name, c.initiative])).toEqual([
      ['Wolf', 12],
      ['Goblin 1', 8],
      ['Goblin 2', 8],
    ]);
    const [goblin] = s.initiative.filter((c) => c.name === 'Goblin 2').map((c) => c.id);
    s = rollInitiative(s, { shareRolls: true, ids: [goblin as string], random: dice(19) });
    expect(s.initiative.map((c) => [c.name, c.initiative])).toEqual([
      ['Goblin 2', 21],
      ['Wolf', 12],
      ['Goblin 1', 8],
    ]);
  });

  it('keeps the turn on the same combatant during combat', () => {
    let s = startCombat(addCombatants(session(), [pc('Hero', 15), monster('Goblin', 0)]));
    s = rollInitiative(s, { random: dice(20) });
    expect(names(s)).toEqual(['Goblin', 'Hero']);
    expect(active(s)).toBe('Hero');
  });

  it('keeps the bonus of encounter monsters for rolling', () => {
    const [eel] = combatantsFromEncounter(loadExample(), 'enc-causeway');
    expect(eel?.initiativeSource).toBe('score');
    expect(eel?.initiative).toBe(10 + (eel?.initiativeBonus ?? 0));
  });
});
