import { describe, expect, it } from 'vitest';
import {
  addCombatants,
  adjustHp,
  combatantFromNpc,
  concentrationDc,
  createCombatant,
  endCombat,
  legendaryMax,
  legendaryUses,
  nextTurn,
  resolveConcentrationSave,
  type Session,
  setConditionRounds,
  setLegendaryLeft,
  srdMonsters,
  startCombat,
  toggleConcentration,
  toggleCondition,
  toggleLair,
} from '../src';
import { nth } from './helpers';

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

const fighter = createCombatant({ name: 'Fighter', kind: 'pc', initiative: 15 });
const goblin = createCombatant({ name: 'Goblin', kind: 'monster', initiative: 10, hp: 30 });
const dragon = createCombatant({
  name: 'Dragon',
  kind: 'monster',
  initiative: 5,
  hp: 200,
  legendaryUses: 3,
});

const of = (s: Session, id: string) => {
  const found = s.initiative.find((c) => c.id === id);
  if (!found) throw new Error(`No combatant ${id}`);
  return found;
};

describe('conditions with a duration', () => {
  it('count down at the end of the creature’s turn and end at zero', () => {
    let s = startCombat(addCombatants(session(), [fighter, goblin]));
    s = toggleCondition(s, goblin.id, 'frightened');
    s = setConditionRounds(s, goblin.id, 'frightened', 2);
    s = nextTurn(s); // fighter's turn ends, goblin's starts
    expect(of(s, goblin.id).conditionRounds).toEqual({ frightened: 2 });
    s = nextTurn(s); // goblin's turn ends
    expect(of(s, goblin.id).conditionRounds).toEqual({ frightened: 1 });
    expect(s.combat?.ended).toBeUndefined();
    s = nextTurn(nextTurn(s)); // round 2: fighter, then goblin's turn ends again
    expect(of(s, goblin.id).conditions).toEqual([]);
    expect(of(s, goblin.id).conditionRounds).toBeUndefined();
    expect(s.combat?.ended).toEqual([{ combatantId: goblin.id, condition: 'frightened' }]);
    s = nextTurn(s);
    expect(s.combat?.ended).toBeUndefined();
  });

  it('keeps conditions without a duration and drops the duration when removed', () => {
    let s = toggleCondition(addCombatants(session(), [goblin]), goblin.id, 'prone');
    s = setConditionRounds(s, goblin.id, 'prone', 1);
    s = setConditionRounds(s, goblin.id, 'prone', undefined);
    expect(of(s, goblin.id).conditionRounds).toBeUndefined();
    s = setConditionRounds(s, goblin.id, 'prone', 3);
    s = toggleCondition(s, goblin.id, 'prone');
    expect(of(s, goblin.id)).not.toHaveProperty('conditionRounds');
    expect(setConditionRounds(s, goblin.id, 'stunned', 2)).toEqual(s);
  });
});

describe('concentration', () => {
  it('works out the DC from the damage', () => {
    expect(concentrationDc(7)).toBe(10);
    expect(concentrationDc(25)).toBe(12);
    expect(concentrationDc(100)).toBe(30);
  });

  it('asks for a save after damage and settles it', () => {
    let s = toggleConcentration(addCombatants(session(), [dragon]), dragon.id);
    s = adjustHp(s, dragon.id, 5); // healing asks nothing
    s = adjustHp(s, dragon.id, -8);
    s = adjustHp(s, dragon.id, -22);
    expect(of(s, dragon.id).concentrationSaves).toEqual([10, 11]);
    s = resolveConcentrationSave(s, dragon.id, true);
    expect(of(s, dragon.id).concentrationSaves).toEqual([11]);
    expect(of(s, dragon.id).concentrating).toBe(true);
    s = resolveConcentrationSave(s, dragon.id, false);
    expect(of(s, dragon.id)).not.toHaveProperty('concentrating');
    expect(of(s, dragon.id)).not.toHaveProperty('concentrationSaves');
  });

  it('ends at 0 hit points or when incapacitated', () => {
    let s = toggleConcentration(addCombatants(session(), [goblin]), goblin.id);
    expect(of(adjustHp(s, goblin.id, -30), goblin.id).concentrating).toBeUndefined();
    s = toggleCondition(s, goblin.id, 'stunned');
    expect(of(s, goblin.id).concentrating).toBeUndefined();
  });

  it('asks nothing of creatures that do not concentrate', () => {
    const s = adjustHp(addCombatants(session(), [goblin]), goblin.id, -10);
    expect(of(s, goblin.id).concentrationSaves).toBeUndefined();
  });
});

describe('legendary actions', () => {
  it('come from stat blocks with legendary actions', () => {
    const lich = srdMonsters.find((m) => (m.legendaryActions?.length ?? 0) > 0);
    const plain = srdMonsters.find((m) => !m.legendaryActions);
    expect(legendaryUses(lich)).toBe(3);
    expect(legendaryUses(plain)).toBeUndefined();
    expect(
      combatantFromNpc({ id: 'n', name: 'Bob', description: '', voice: '', notes: '', tags: [] })
        .legendary,
    ).toBeUndefined();
  });

  it('are used up and come back at the start of the creature’s turn', () => {
    let s = startCombat(addCombatants(session(), [fighter, dragon]));
    s = setLegendaryLeft(s, dragon.id, 1);
    expect(of(s, dragon.id).legendary?.left).toBe(1);
    s = setLegendaryLeft(s, dragon.id, 9);
    expect(of(s, dragon.id).legendary?.left).toBe(3);
    s = setLegendaryLeft(s, dragon.id, 0);
    s = nextTurn(s);
    expect(nth(s.initiative, 1).name).toBe('Dragon');
    expect(of(s, dragon.id).legendary?.left).toBe(3);
  });

  it('get one more use in the lair', () => {
    let s = addCombatants(session(), [dragon]);
    s = toggleLair(s, dragon.id);
    expect(legendaryMax(of(s, dragon.id))).toBe(4);
    expect(of(s, dragon.id).legendary?.left).toBe(4);
    s = toggleLair(s, dragon.id);
    expect(of(s, dragon.id).legendary).toEqual({ uses: 3, left: 3 });
  });
});

describe('after combat', () => {
  it('clears durations and concentration of the player characters', () => {
    let s = startCombat(addCombatants(session(), [fighter, goblin]));
    s = toggleCondition(toggleConcentration(s, fighter.id), fighter.id, 'blinded');
    s = setConditionRounds(s, fighter.id, 'blinded', 2);
    s = endCombat(s);
    expect(s.initiative).toEqual([{ ...fighter, conditions: [] }]);
  });
});
