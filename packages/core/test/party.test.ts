import { describe, expect, it } from 'vitest';
import {
  buildAdaptPrompt,
  buildAdventurePrompt,
  combatantsFromParty,
  createCharacter,
  createParty,
  encounterBudget,
  followParty,
  leaveParty,
  type Party,
  parseAdaptedAdventure,
  parsePartyLibrary,
  partyNumbers,
  partyOf,
  serializePartyLibrary,
} from '../src';
import { loadExample } from './helpers';

function group(): Party {
  const party = createParty('Tuesday group');
  party.characters = [
    { ...createCharacter('Mira', 3), className: 'Ranger', ac: 15, maxHp: 24, player: 'Sam' },
    {
      ...createCharacter('Thorn', 3),
      className: 'Cleric',
      ac: 18,
      maxHp: 21,
      notes: 'Hates the sea',
    },
    { ...createCharacter('Wren', 2), className: 'Rogue', passivePerception: 15 },
  ];
  return party;
}

describe('party', () => {
  it('gives the adventure its size and levels', () => {
    const party = group();
    expect(partyNumbers(party)).toEqual({
      size: 3,
      level: 3,
      levels: [3, 3, 2],
      partyId: party.id,
    });
    const adventure = followParty(loadExample(), party);
    expect(adventure.party).toMatchObject({ size: 3, level: 3, partyId: party.id });
    expect(followParty(adventure, party)).toBe(adventure);
    expect(partyOf(adventure, [party])).toBe(party);
    expect(leaveParty(adventure).party).toEqual({ size: 3, level: 3 });
  });

  it('keeps the size and level of the adventure while the party has no characters', () => {
    const party = createParty('New group');
    const example = loadExample();
    const adventure = followParty(example, party);
    expect(adventure.party).toEqual({ ...example.party, partyId: party.id });
    expect(followParty(adventure, party)).toBe(adventure);
    const prompt = buildAdventurePrompt({
      idea: '',
      partySize: 5,
      partyLevel: 4,
      length: 'one-shot',
      language: 'en',
      party,
    });
    expect(prompt).toContain('Party: 5 characters of level 4');
  });

  it('adds up the budget of each level when the levels differ', () => {
    expect(encounterBudget({ size: 3, level: 3, levels: [3, 3, 2] })).toEqual({
      low: 400,
      moderate: 600,
      high: 1000,
    });
  });

  it('puts the characters into the initiative once', () => {
    const party = group();
    const added = combatantsFromParty(party, [], { trackHitPoints: true });
    expect(added.map((c) => [c.name, c.kind, c.ac, c.hp?.max])).toEqual([
      ['Mira', 'pc', 15, 24],
      ['Thorn', 'pc', 18, 21],
      ['Wren', 'pc', undefined, undefined],
    ]);
    expect(combatantsFromParty(party, [])[0]?.hp).toBeUndefined();
    expect(combatantsFromParty(party, added.slice(0, 2)).map((c) => c.name)).toEqual(['Wren']);
  });

  it('keeps parties in a file and skips a broken one', () => {
    const party = group();
    const text = serializePartyLibrary([party]);
    expect(parsePartyLibrary(text).parties).toEqual([party]);
    const broken = JSON.parse(text);
    broken.parties.push({ id: 'party-x' });
    const result = parsePartyLibrary(JSON.stringify(broken));
    expect(result.parties).toHaveLength(1);
    expect(result.problems).toHaveLength(1);
  });

  it('tells the AI about the characters', () => {
    const party = group();
    const adventure = followParty(loadExample(), party);
    const adapt = buildAdaptPrompt(adventure, new Date(), [], party);
    expect(adapt).toContain('Party: 3 characters of level 3 (levels 3, 3, 2)');
    expect(adapt).toContain('- Mira (Sam): Ranger, level 3, AC 15, 24 HP');
    expect(adapt).toContain('- Thorn: Cleric, level 3, AC 18, 21 HP. Hates the sea');
    expect(adapt).toContain('give every character one moment');
    const fresh = buildAdventurePrompt({
      idea: '',
      partySize: 4,
      partyLevel: 1,
      length: 'one-shot',
      language: 'en',
      party,
    });
    expect(fresh).toContain('## The characters');
    expect(fresh).toContain('- Wren: Rogue, level 2, passive Perception 15');
  });

  it('keeps the link to the party when an adapted adventure comes back', () => {
    const party = group();
    const adventure = followParty(loadExample(), party);
    const answer = {
      format: 'lorewarden.adventure',
      version: 1,
      exportedAt: new Date().toISOString(),
      adventure: { ...adventure, party: { size: 3, level: 3 } },
    };
    const result = parseAdaptedAdventure(adventure, JSON.stringify(answer));
    if (!result.ok) throw new Error(JSON.stringify(result.problems));
    expect(result.adventure.party.partyId).toBe(party.id);
  });
});
