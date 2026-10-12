import { describe, expect, it } from 'vitest';
import {
  addCombatants,
  askForInitiative,
  type Combatant,
  createCombatant,
  endCombat,
  enterPlayerInitiative,
  forgetPlayer,
  nextTurn,
  playerView,
  type Session,
  startCombat,
  stopAskingForInitiative,
  tableState,
} from '../src';
import { loadExample } from './helpers';

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

const wren = { id: 'player-wren', name: 'Wren' };
const ash = { id: 'player-ash', name: 'Ash' };
const now = new Date('2026-01-01T18:10:00.000Z');
const names = (s: Session) => s.initiative.map((c: Combatant) => c.name);
const active = (s: Session) => (s.combat ? s.initiative[s.combat.turn]?.name : undefined);

function withGoblin(): Session {
  const goblin = createCombatant({ name: 'Goblin', kind: 'monster', initiative: 12 });
  return addCombatants(session(), [goblin]);
}

describe('initiative from the player app', () => {
  it('is only taken while the app asks for it', () => {
    const s = withGoblin();
    expect(enterPlayerInitiative(s, wren, 15)).toBe(s);
    const asked = askForInitiative(s, now);
    expect(enterPlayerInitiative(asked, wren, 15).initiative).toHaveLength(2);
    expect(enterPlayerInitiative(asked, wren, 1000)).toBe(asked);
    expect(enterPlayerInitiative(stopAskingForInitiative(asked), wren, 15).initiative).toHaveLength(
      1,
    );
  });

  it('adds the player, sorts them in and remembers who answered', () => {
    const s = enterPlayerInitiative(askForInitiative(withGoblin(), now), wren, 15);
    expect(names(s)).toEqual(['Wren', 'Goblin']);
    expect(s.initiative[0]).toMatchObject({
      kind: 'pc',
      initiativeSource: 'player',
      playerId: 'player-wren',
    });
    expect(s.initiativeRequest?.answered).toEqual(['player-wren']);

    const changed = enterPlayerInitiative(s, wren, 9);
    expect(names(changed)).toEqual(['Goblin', 'Wren']);
    expect(changed.initiative).toHaveLength(2);
    expect(changed.initiativeRequest?.answered).toEqual(['player-wren']);
  });

  it('fills in the character with the player name, or the one linked before', () => {
    const thorin = createCombatant({ name: 'Thorin', kind: 'pc', initiative: 0 });
    const named = createCombatant({ name: ' wren ', kind: 'pc', initiative: 0 });
    let s = askForInitiative(addCombatants(withGoblin(), [thorin, named]), now);
    s = enterPlayerInitiative(s, wren, 18);
    expect(names(s)).toEqual([' wren ', 'Goblin', 'Thorin']);

    // The game master renamed the character; the link stays.
    s = {
      ...s,
      initiative: s.initiative.map((c) =>
        c.id === named.id ? { ...c, name: 'Wren the Bold' } : c,
      ),
    };
    s = enterPlayerInitiative(s, wren, 5);
    expect(names(s)).toEqual(['Goblin', 'Wren the Bold', 'Thorin']);
  });

  it('keeps the turn at the top until the first turn is over', () => {
    let s = startCombat(askForInitiative(withGoblin(), now));
    expect(active(s)).toBe('Goblin');
    s = enterPlayerInitiative(s, wren, 20);
    expect(active(s)).toBe('Wren');

    s = nextTurn(s);
    expect(active(s)).toBe('Goblin');
    expect(s.initiativeRequest).toBeUndefined();

    s = enterPlayerInitiative(askForInitiative(s, now), ash, 25);
    expect(active(s)).toBe('Goblin');
  });

  it('stops asking when the combat ends', () => {
    const s = enterPlayerInitiative(startCombat(askForInitiative(withGoblin(), now)), wren, 14);
    const ended = endCombat(s);
    expect(ended.initiativeRequest).toBeUndefined();
    expect(names(ended)).toEqual(['Wren']);
  });

  it('shows every phone the request and its own answer', () => {
    const adventure = loadExample();
    let s = askForInitiative(withGoblin(), now);
    s = enterPlayerInitiative(s, wren, 15);
    const state = tableState(adventure, s, 'K7QM2X');
    expect(state.initiative).toEqual({ at: now.toISOString(), answers: { 'player-wren': 15 } });
    expect(playerView(state, wren, () => '').initiative).toEqual({
      at: now.toISOString(),
      value: 15,
    });
    expect(playerView(state, ash, () => '').initiative).toEqual({ at: now.toISOString() });
    expect(tableState(adventure, stopAskingForInitiative(s), 'K7QM2X')).not.toHaveProperty(
      'initiative',
    );
  });

  it('drops the link when the player is forgotten', () => {
    const s = forgetPlayer(
      enterPlayerInitiative(askForInitiative(withGoblin(), now), wren, 15),
      wren.id,
    );
    expect(s.initiative.find((c) => c.name === 'Wren')).not.toHaveProperty('playerId');
    expect(s.initiativeRequest?.answered).toEqual([]);
  });
});
