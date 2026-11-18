import { describe, expect, it } from 'vitest';
import {
  addLogNote,
  buildAdaptPrompt,
  buildAdventurePrompt,
  buildWhatHappenedPrompt,
  createCharacter,
  createParty,
  describeChronicle,
  followParty,
  moveToScene,
  type Party,
  partyHistory,
  playedBy,
  type Session,
  setWhatHappened,
  startSession,
  toggleClueFound,
  togglePuzzleSolved,
} from '../src';
import { loadExample, nth } from './helpers';

function group(): Party {
  const party = createParty('Tuesday group');
  party.characters = [{ ...createCharacter('Mira', 3), className: 'Ranger' }];
  return party;
}

/** A session of the example adventure played by the party on the given day. */
function played(party: Party, day: string): Session {
  const adventure = followParty(loadExample(), party);
  return startSession(adventure, undefined, new Date(`${day}T18:00:00.000Z`));
}

describe('sessions of a party', () => {
  it('belong to the party the adventure is played with', () => {
    const party = group();
    expect(played(party, '2026-11-01').partyId).toBe(party.id);
    expect(startSession(loadExample()).partyId).toBeUndefined();
  });

  it('follow when the adventure gets another party', () => {
    const session = startSession(loadExample());
    const linked = playedBy(session, 'party-a');
    expect(linked.partyId).toBe('party-a');
    expect(playedBy(linked, 'party-a')).toBe(linked);
    expect('partyId' in playedBy(linked, undefined)).toBe(false);
  });
});

describe('partyHistory', () => {
  it('groups the sessions by adventure with what the party found and where it ended', () => {
    const party = group();
    const adventure = loadExample();
    const island = nth(
      adventure.scenes.filter((s) => s.id === 'scene-island'),
      0,
    );
    let second = played(party, '2026-11-08');
    second = toggleClueFound(second, 'clue-iselde');
    second = togglePuzzleSolved(second, 'puzzle-tower-door');
    second = addLogNote(second, 'They broke the lantern');
    second = moveToScene(second, island);
    const first = played(party, '2026-11-01');
    const other = startSession(adventure);

    const history = partyHistory(party, [first, other, second], [adventure]);
    expect(history.partyName).toBe('Tuesday group');
    expect(history.adventures).toHaveLength(1);
    const entry = nth(history.adventures, 0);
    expect(entry).toMatchObject({
      adventureId: adventure.id,
      title: adventure.title,
      exists: true,
    });
    expect(entry.summary).toContain('green lantern');
    expect(entry.sessions.map((s) => s.id)).toEqual([second.id, first.id]);
    const latest = nth(entry.sessions, 0);
    expect(latest.lastScene).toEqual({ title: "The Lamplighter's Island", ending: true });
    expect(latest.foundClues).toEqual([
      'Iselde crossed to the marsh seven years ago and never came back.',
    ]);
    expect(latest.solvedPuzzles).toEqual(['The Tower Door']);
    expect(latest.log.map((e) => e.text)).toContain('They broke the lantern');
    expect(nth(entry.sessions, 1).lastScene?.ending).toBe(false);
  });

  it('keeps the notes of deleted adventures behind the ones still played', () => {
    let party = group();
    party = setWhatHappened(party, { adventureId: 'adv-old', title: 'The Old Mill' }, '- Done');
    party = setWhatHappened(party, { adventureId: 'adv-older', title: 'Older' }, '- Long ago');
    const adventure = loadExample();
    const history = partyHistory(party, [played(party, '2026-11-01')], [adventure]);
    expect(history.adventures.map((a) => a.title)).toEqual([
      adventure.title,
      'Older',
      'The Old Mill',
    ]);
    expect(nth(history.adventures, 2)).toMatchObject({ exists: false, whatHappened: '- Done' });
    expect(nth(history.adventures, 2).sessions).toEqual([]);
  });
});

describe('setWhatHappened', () => {
  it('adds a note first and changes it in place later', () => {
    let party = group();
    party = setWhatHappened(party, { adventureId: 'adv-a', title: 'A' }, '- a');
    party = setWhatHappened(party, { adventureId: 'adv-b', title: 'B' }, '- b');
    party = setWhatHappened(party, { adventureId: 'adv-a', title: 'A' }, '- a, changed');
    expect(party.chronicle.map((e) => [e.adventureId, e.whatHappened])).toEqual([
      ['adv-b', '- b'],
      ['adv-a', '- a, changed'],
    ]);
  });

  it('drops a cleared note of a deleted adventure', () => {
    const party = setWhatHappened(group(), { adventureId: 'adv-a', title: 'A' }, '- a');
    const kept = setWhatHappened(party, { adventureId: 'adv-a', title: 'A', exists: true }, '');
    expect(kept.chronicle).toHaveLength(1);
    const gone = setWhatHappened(party, { adventureId: 'adv-a', title: 'A', exists: false }, '');
    expect(gone.chronicle).toEqual([]);
  });
});

describe('the chronicle in AI instructions', () => {
  function veterans(): Party {
    return setWhatHappened(
      group(),
      { adventureId: 'adv-mill', title: 'The Silent Mill' },
      '- **Ending**: the miller was freed\nThe **apprentice** fled',
    );
  }

  it('lists the notes as bullet points under each adventure', () => {
    expect(describeChronicle(veterans())).toBe(
      '- "The Silent Mill":\n  - **Ending**: the miller was freed\n  - The **apprentice** fled',
    );
    expect(describeChronicle(group())).toBe('');
  });

  it('lets a new adventure build on the earlier ones instead of asking', () => {
    const request = { idea: '', partySize: 4, partyLevel: 1, length: 'one-shot', language: 'en' };
    const prompt = buildAdventurePrompt({ ...request, party: veterans() });
    expect(prompt).toContain('## What the group played before');
    expect(prompt).toContain('  - The **apprentice** fled');
    expect(prompt).toContain('do not ask me about it');
    expect(buildAdventurePrompt({ ...request, party: group() })).not.toContain('## What the group');
  });

  it('gives the notes to the adapt prompt', () => {
    const party = veterans();
    const prompt = buildAdaptPrompt(followParty(loadExample(), party), new Date(), [], party);
    expect(prompt).toContain('## What the group played before');
    expect(prompt).not.toContain('do not ask me about it');
  });

  it('asks the AI to write what happened from the logs', () => {
    const party = group();
    const session = addLogNote(played(party, '2026-11-01'), 'Brannoc was paid in silver');
    const entry = nth(partyHistory(party, [session], [loadExample()]).adventures, 0);
    const prompt = buildWhatHappenedPrompt(entry);
    expect(prompt).toContain('"The Lantern in the Marsh"');
    expect(prompt).toContain('### Session 1, 2026-11-01');
    expect(prompt).toContain('- Brannoc was paid in silver');
    expect(prompt).toContain('## What the adventure was about');
    expect(prompt).toContain('hold a grudge');
  });
});
