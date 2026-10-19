import { describe, expect, it } from 'vitest';
import {
  type Adventure,
  activeMechanics,
  addCombatants,
  adjustHp,
  checkIntegrity,
  combatantsFromEncounter,
  createCombatant,
  endCombat,
  fireMechanics,
  nextTurn,
  previousTurn,
  releaseMechanicTargets,
  removeCombatant,
  reviewAdventure,
  type Session,
  startCombat,
  startSession,
  toggleMechanic,
} from '../src';
import { loadExample, nth } from './helpers';

/** The example with a crystal that shields the eels and two mechanics. */
function withMechanics(): Adventure {
  const adventure = loadExample();
  const encounter = nth(adventure.encounters, 0);
  encounter.objects = [{ id: 'obj-crystal', name: 'Crystal', ac: 13, hp: 10 }];
  encounter.mechanics = [
    { id: 'mech-tide', trigger: 'round', round: 2, text: 'The tide comes in.' },
    { id: 'mech-shield', trigger: 'defeated', target: 'obj-crystal', text: 'The shield fails.' },
    { id: 'mech-flee', trigger: 'bloodied', target: 'pool-marsh-eel', text: 'An eel flees.' },
    { id: 'mech-horn', trigger: 'manual', text: 'A horn sounds.' },
  ];
  return adventure;
}

function fight(adventure: Adventure): Session {
  const session = startSession(adventure);
  const hero = createCombatant({ name: 'Hero', kind: 'pc', initiative: 15 });
  const combatants = combatantsFromEncounter(adventure, 'enc-causeway');
  return addCombatants(session, [hero, ...combatants]);
}

const byName = (session: Session, name: string) =>
  nth(
    session.initiative.filter((c) => c.name === name),
    0,
  );

describe('objects in the initiative tracker', () => {
  it('join with the encounter at the end of the list and take no turn', () => {
    const session = fight(withMechanics());
    const crystal = byName(session, 'Crystal');
    expect(crystal).toMatchObject({ kind: 'object', ac: 13, hp: { current: 10, max: 10 } });
    expect(session.initiative.at(-1)?.id).toBe(crystal.id);

    let s = startCombat(session);
    const turns = [];
    for (let i = 0; i < 4; i++) {
      turns.push(s.initiative[s.combat?.turn ?? -1]?.name);
      s = nextTurn(s);
    }
    expect(turns).toEqual(['Hero', 'Marsh Eel 1', 'Marsh Eel 2', 'Hero']);
    expect(s.combat?.round).toBe(2);
    expect(previousTurn(previousTurn(s)).combat).toEqual({ round: 1, turn: 2 });
  });

  it('pass the turn on when the active combatant before an object leaves', () => {
    let s = startCombat(fight(withMechanics()));
    s = nextTurn(nextTurn(s));
    s = removeCombatant(s, byName(s, 'Marsh Eel 2').id);
    expect(s.initiative[s.combat?.turn ?? -1]?.name).toBe('Hero');
    expect(s.combat?.round).toBe(2);
  });
});

describe('fireMechanics', () => {
  it('fires round, bloodied and defeated triggers once', () => {
    const adventure = withMechanics();
    let s = startCombat(fight(adventure));
    expect(fireMechanics(adventure, s)).toBe(s);

    s = fireMechanics(adventure, nextTurn(nextTurn(nextTurn(s))));
    expect(s.firedMechanicIds).toEqual(['mech-tide']);

    s = fireMechanics(adventure, adjustHp(s, byName(s, 'Marsh Eel 1').id, -8));
    expect(s.firedMechanicIds).toEqual(['mech-tide', 'mech-flee']);

    s = fireMechanics(adventure, adjustHp(s, byName(s, 'Crystal').id, -10));
    expect(s.firedMechanicIds).toEqual(['mech-tide', 'mech-flee', 'mech-shield']);
    expect(fireMechanics(adventure, s)).toBe(s);
  });

  it('leaves manual mechanics to the game master and forgets all at the end', () => {
    const adventure = withMechanics();
    let s = startCombat(fight(adventure));
    s = toggleMechanic(s, 'mech-horn');
    expect(activeMechanics(adventure, s).find((m) => m.fired)?.mechanic.id).toBe('mech-horn');
    expect(toggleMechanic(s, 'mech-horn').firedMechanicIds).toEqual([]);
    expect(endCombat(s).firedMechanicIds).toEqual([]);
  });

  it('ignores mechanics of encounters that are not in the fight', () => {
    const adventure = withMechanics();
    expect(activeMechanics(adventure, startSession(adventure))).toEqual([]);
  });
});

describe('mechanics in the checks', () => {
  it('reports triggers without a round or a target of the encounter', () => {
    const adventure = withMechanics();
    const encounter = nth(adventure.encounters, 0);
    encounter.mechanics = [
      { id: 'mech-a', trigger: 'round', text: 'x' },
      { id: 'mech-b', trigger: 'bloodied', text: 'x' },
      { id: 'mech-c', trigger: 'defeated', target: 'pool-nothing', text: 'x' },
    ];
    expect(checkIntegrity(adventure).map((p) => p.path)).toEqual([
      'encounters[0].mechanics[0].round',
      'encounters[0].mechanics[1].target',
      'encounters[0].mechanics[2].target',
    ]);
  });

  it('suggests a mechanic for a climactic fight without one', () => {
    const adventure = loadExample();
    const encounter = nth(adventure.encounters, 0);
    const climax = (a: Adventure) =>
      reviewAdventure(a).filter((hint) => hint.kind === 'climaxWithoutMechanic');
    expect(climax(adventure)).toEqual([]);
    encounter.difficulty = 'high';
    expect(climax(adventure)).toEqual([
      { kind: 'climaxWithoutMechanic', encounterId: encounter.id },
    ]);
    expect(
      climax({
        ...withMechanics(),
        encounters: [{ ...encounter, mechanics: nth(withMechanics().encounters, 0).mechanics }],
      }),
    ).toEqual([]);
  });
});

describe('releaseMechanicTargets', () => {
  it('hands triggers watching a removed creature or object back to the game master', () => {
    const encounter = nth(withMechanics().encounters, 0);
    expect(releaseMechanicTargets(encounter)).toBe(encounter.mechanics);
    const without = { ...encounter, objects: [], monsters: [] };
    const mechanics = releaseMechanicTargets(without);
    expect(mechanics.map((m) => [m.id, m.trigger, m.target])).toEqual([
      ['mech-tide', 'round', undefined],
      ['mech-shield', 'manual', undefined],
      ['mech-flee', 'manual', undefined],
      ['mech-horn', 'manual', undefined],
    ]);
    expect(nth(mechanics, 1)).not.toHaveProperty('target');
  });
});
