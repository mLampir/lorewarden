import { describe, expect, it } from 'vitest';
import {
  applySignUp,
  combatantOfPlayer,
  combatantsFromParty,
  createCharacter,
  createParty,
  describeCharacters,
  MAX_CHARACTERS_PER_PLAYER,
  type Party,
  signUpView,
  startSession,
  tableInfo,
  tableState,
  takeSignUps,
} from '../src';
import { loadExample } from './helpers';

const entered = {
  name: 'Mira',
  className: 'Ranger',
  level: 3,
  ac: 15,
  backstory: 'Raised by marsh witches',
  goals: 'Find her lost brother',
  playerNotes: 'Likes riddles',
};

function party(): Party {
  const p = createParty('Tuesday group');
  p.characters = [{ ...createCharacter('Thorn', 3), notes: 'Hates the sea' }];
  p.signUpCode = 'K7QM2X';
  return p;
}

describe('sign-up from the phones', () => {
  it('adds a character that only its phone can change', () => {
    const added = applySignUp(party(), 'player-a', { character: entered });
    if (!added) throw new Error('not added');
    const mira = added.party.characters.find((c) => c.id === added.characterId);
    expect(mira).toMatchObject({ ...entered, ownerId: 'player-a', notes: '' });

    const change = { characterId: added.characterId, character: { ...entered, level: 4 } };
    expect(applySignUp(added.party, 'player-b', change)).toBeUndefined();
    const changed = applySignUp(added.party, 'player-a', change);
    expect(changed?.party.characters.find((c) => c.id === added.characterId)?.level).toBe(4);
  });

  it('keeps the game master notes and drops numbers the player cleared', () => {
    const added = applySignUp(party(), 'player-a', { character: entered });
    if (!added) throw new Error('not added');
    const withNotes = {
      ...added.party,
      characters: added.party.characters.map((c) => ({ ...c, notes: 'Owes the ferryman' })),
    };
    const { ac: _, ...withoutAc } = entered;
    const changed = applySignUp(withNotes, 'player-a', {
      characterId: added.characterId,
      character: withoutAc,
    });
    const mira = changed?.party.characters.find((c) => c.id === added.characterId);
    expect(mira?.notes).toBe('Owes the ferryman');
    expect(mira).not.toHaveProperty('ac');
  });

  it('keeps the initiative bonus the game master set', () => {
    const added = applySignUp(party(), 'player-a', { character: entered });
    if (!added) throw new Error('not added');
    const withBonus = {
      ...added.party,
      characters: added.party.characters.map((c) => ({ ...c, initiativeBonus: 3 })),
    };
    const changed = applySignUp(withBonus, 'player-a', {
      characterId: added.characterId,
      character: { ...entered, goals: 'Avenge her brother' },
    });
    if (!changed) throw new Error('not changed');
    const mira = changed.party.characters.find((c) => c.id === added.characterId);
    expect(mira).toMatchObject({ initiativeBonus: 3, goals: 'Avenge her brother' });

    const local = {
      ...withBonus,
      characters: withBonus.characters.map((c) => ({ ...c, initiativeBonus: 4 })),
    };
    const merged = takeSignUps(local, changed.party);
    expect(merged.characters.find((c) => c.id === added.characterId)).toMatchObject({
      initiativeBonus: 4,
      goals: 'Avenge her brother',
    });
  });

  it('tells the AI where the characters come from and what they want', () => {
    const added = applySignUp(party(), 'player-a', { character: entered });
    if (!added) throw new Error('not added');
    const lines = describeCharacters(added.party);
    expect(lines).toContain('Backstory: Raised by marsh witches');
    expect(lines).toContain('Goals: Find her lost brother');
    expect(lines).toContain('The player wrote: Likes riddles');
  });

  it('cannot change characters the game master entered', () => {
    const p = party();
    const thorn = p.characters[0]?.id;
    expect(applySignUp(p, 'player-a', { characterId: thorn, character: entered })).toBeUndefined();
  });

  it('limits how many characters a phone adds', () => {
    let p = party();
    for (let i = 0; i < MAX_CHARACTERS_PER_PLAYER; i++) {
      p = applySignUp(p, 'player-a', { character: entered })?.party ?? p;
    }
    expect(applySignUp(p, 'player-a', { character: entered })).toBeUndefined();
    expect(applySignUp(p, 'player-b', { character: entered })).toBeDefined();
  });

  it('shows other characters without their numbers or notes', () => {
    const added = applySignUp(party(), 'player-a', { character: entered });
    if (!added) throw new Error('not added');
    const mine = signUpView(added.party, 'player-a');
    expect(mine.mine).toEqual([{ id: added.characterId, ...entered }]);
    expect(mine.others).toEqual([{ name: 'Thorn', className: '', level: 3 }]);
    const theirs = signUpView(added.party, 'player-b');
    expect(theirs.mine).toEqual([]);
    expect(JSON.stringify(theirs)).not.toContain('player-a');
    expect(JSON.stringify(theirs)).not.toContain('Hates the sea');
  });

  it('brings sign-ups into the copy the game master edits', () => {
    const local = party();
    const added = applySignUp(local, 'player-a', { character: entered });
    if (!added) throw new Error('not added');
    expect(takeSignUps(local, local)).toBe(local);
    const merged = takeSignUps(local, added.party);
    expect(merged.characters.map((c) => c.name)).toEqual(['Thorn', 'Mira']);
    expect(takeSignUps(merged, added.party)).toBe(merged);

    const noted = {
      ...merged,
      characters: merged.characters.map((c) => ({ ...c, notes: 'secret' })),
    };
    const later = applySignUp(added.party, 'player-a', {
      characterId: added.characterId,
      character: { ...entered, level: 5 },
    });
    if (!later) throw new Error('not changed');
    const again = takeSignUps(noted, later.party);
    const mira = again.characters.find((c) => c.id === added.characterId);
    expect(mira).toMatchObject({ level: 5, notes: 'secret' });
  });
});

describe('picking a character when joining', () => {
  it('tells the phones which characters are free', () => {
    const adventure = loadExample();
    const p = party();
    const thorn = p.characters[0];
    if (!thorn) throw new Error('no character');
    const session = startSession(adventure);
    const state = tableState(adventure, session, 'K7QM2X', '', p);
    expect(state.characters).toEqual([{ id: thorn.id, name: 'Thorn' }]);
    expect(tableState(adventure, session, 'K7QM2X')).not.toHaveProperty('characters');

    const online = [{ id: 'player-a', name: 'Sam', characterId: thorn.id }];
    expect(tableInfo(state, online).characters).toEqual([
      { id: thorn.id, name: 'Thorn', taken: true },
    ]);
  });

  it('links the phone to its character in the initiative list', () => {
    const adventure = loadExample();
    const p = party();
    const thorn = p.characters[0];
    if (!thorn) throw new Error('no character');
    const session = {
      ...startSession(adventure),
      initiative: combatantsFromParty(p, []),
    };
    const player = { id: 'player-a', name: 'Sam', characterId: thorn.id };
    expect(combatantOfPlayer(session, player)?.ref).toBe(thorn.id);
  });
});
