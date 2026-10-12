import { describe, expect, it } from 'vitest';
import {
  addReveal,
  brokenLinks,
  reviewAdventure,
  splitLinks,
  startSession,
  stripLinks,
  tableState,
} from '../src';
import { loadExample, nth } from './helpers';

describe('links', () => {
  it('splits text at links to NPCs and items', () => {
    expect(
      splitLinks('At the bar stands [a tall woman](npc-bertha), [ale](item-ale) in hand.'),
    ).toEqual([
      { text: 'At the bar stands ' },
      { text: 'a tall woman', id: 'npc-bertha' },
      { text: ', ' },
      { text: 'ale', id: 'item-ale' },
      { text: ' in hand.' },
    ]);
  });

  it('leaves other brackets alone', () => {
    const text = 'A note [see below](https://example.org) and [scene](scene-cellar).';
    expect(splitLinks(text)).toEqual([{ text }]);
    expect(stripLinks(text)).toBe(text);
  });

  it('shows players only the words of a link', () => {
    expect(stripLinks('Ask [the ferryman](npc-brannoc).')).toBe('Ask the ferryman.');
    const adventure = loadExample();
    const session = addReveal(startSession(adventure), {
      kind: 'text',
      text: 'A [man](npc-brannoc).',
      to: 'all',
    });
    const state = tableState(adventure, session, 'CODE');
    expect(nth(state.reveals, 0).text).toBe('A man.');
  });

  it('reports links to NPCs or items the adventure does not have', () => {
    const adventure = loadExample();
    const scene = nth(adventure.scenes, 0);
    scene.notes = '- **Ferryman** is [Brannoc](npc-brannoc), not [the ghost](npc-gone).';
    expect(brokenLinks(adventure)).toEqual([{ text: 'the ghost', id: 'npc-gone' }]);
    expect(reviewAdventure(adventure)).toContainEqual({
      kind: 'brokenLink',
      text: 'the ghost',
      id: 'npc-gone',
    });
  });
});
