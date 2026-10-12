import { describe, expect, it } from 'vitest';
import { buildTermIndex, linkTerms } from '../src';
import { loadExample } from './helpers';

const linked = (text: string, index = buildTermIndex()) =>
  linkTerms(text, index)
    .filter((s) => s.target)
    .map((s) => [
      s.text,
      s.target?.kind === 'rule'
        ? s.target.rule.name
        : s.target?.kind === 'npc'
          ? s.target.npc.name
          : s.target?.kind === 'item'
            ? s.target.item.name
            : s.target?.statBlock.name,
    ]);

describe('linkTerms', () => {
  it('finds rules terms as the rules print them', () => {
    expect(
      linked('On a failed DC 12 Wisdom saving throw the target is Frightened and falls Prone.'),
    ).toEqual([
      ['DC', 'Difficulty Class'],
      ['saving throw', 'Saving Throw'],
      ['Frightened', 'Frightened'],
      ['Prone', 'Prone'],
    ]);
    expect(linked('She was frightened and lay prone.')).toEqual([]);
  });

  it('leaves out everyday words', () => {
    expect(linked('Search the room. Help arrives at Dash speed.')).toEqual([]);
  });

  it('finds SRD creatures as printed, also in the plural', () => {
    expect(linked('Two Goblin Warriors and a Wolf guard the gate.')).toEqual([
      ['Goblin Warriors', 'Goblin Warrior'],
      ['Wolf', 'Wolf'],
    ]);
    expect(linked('A wolf howls; the werewolfish man smiles.')).toEqual([]);
  });

  it("finds the adventure's own creatures in any case", () => {
    const index = buildTermIndex(loadExample());
    expect(linked('The marsh eels circle the boat.', index)).toEqual([
      ['marsh eels', 'Reed Stalker'],
    ]);
  });

  it("finds the adventure's NPCs and items, NPCs also by a part of their name", () => {
    const index = buildTermIndex(loadExample());
    expect(
      linked('Old Brannoc hides the ferry logbook. Iselde knows; ask Brannoc.', index),
    ).toEqual([
      ['Old Brannoc', 'Old Brannoc'],
      ['ferry logbook', 'Ferry Logbook'],
      ['Iselde', 'Iselde'],
      ['Brannoc', 'Old Brannoc'],
    ]);
    // Name parts count only as written, and titles such as "Old" never alone.
    expect(linked('A brannoc tree grows. Old age.', index)).toEqual([]);
  });

  it('leaves name parts to the rules and to NPCs that share them', () => {
    const adventure = loadExample();
    adventure.npcs = [
      { ...adventure.npcs[0]!, id: 'a', name: 'Mara Bandit' },
      { ...adventure.npcs[0]!, id: 'b', name: 'Mara Quill' },
    ];
    const index = buildTermIndex(adventure);
    expect(linked('Mara meets a Bandit and Quill.', index)).toEqual([
      ['Bandit', 'Bandit'],
      ['Quill', 'Mara Quill'],
    ]);
  });

  it('keeps the whole text', () => {
    const text = 'A Ghoul waits in Darkness, DC 13.';
    expect(
      linkTerms(text, buildTermIndex())
        .map((s) => s.text)
        .join(''),
    ).toBe(text);
  });
});
