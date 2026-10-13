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
    const text = 'A note [see below](https://example.org) and [a list] (of things).';
    expect(splitLinks(text)).toEqual([{ text }]);
    expect(stripLinks(text)).toBe(text);
  });

  it('links ids without the usual prefix and reports links to other entries', () => {
    const adventure = loadExample();
    const npc = nth(adventure.npcs, 0);
    npc.id = 'bertha';
    const scene = nth(adventure.scenes, 0);
    scene.notes = '- **Bar** has [Bertha](bertha) and [the cellar](scene-cellar).';
    expect(stripLinks(scene.notes)).toBe('- **Bar** has Bertha and the cellar.');
    const broken = brokenLinks(adventure);
    expect(broken).toContainEqual({ text: 'the cellar', id: 'scene-cellar' });
    expect(broken).not.toContainEqual({ text: 'Bertha', id: 'bertha' });
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
