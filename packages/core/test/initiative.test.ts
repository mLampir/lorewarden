import { describe, expect, it } from 'vitest';
import {
  addCombatants,
  adjustHp,
  type Combatant,
  combatantsFromEncounter,
  createCombatant,
  endCombat,
  nextTurn,
  previousTurn,
  removeCombatant,
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
});
