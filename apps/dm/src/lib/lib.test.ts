import { describe, expect, it } from 'vitest';
import { slugify } from './download';
import { extractJson } from './extract-json';
import { fillIfBlank } from './fallback';

describe('slugify', () => {
  it('makes file-name friendly slugs', () => {
    expect(slugify('The Lantern in the Marsh!')).toBe('the-lantern-in-the-marsh');
    expect(slugify('Über die Brücke')).toBe('uber-die-brucke');
    expect(slugify('???')).toBe('adventure');
  });
});

describe('fillIfBlank', () => {
  it('replaces blank text but keeps real text', () => {
    const scene = { title: '  ' };
    fillIfBlank(scene, 'title', 'Untitled');
    expect(scene.title).toBe('Untitled');
    fillIfBlank(scene, 'title', 'Other');
    expect(scene.title).toBe('Untitled');
  });
});

describe('extractJson', () => {
  it('takes the json code block out of an answer', () => {
    const answer = 'Here you go:\n```json\n{ "a": 1 }\n```\nHave fun!';
    expect(extractJson(answer)).toBe('{ "a": 1 }');
  });

  it('falls back to the outermost braces', () => {
    expect(extractJson('Sure. { "a": { "b": 2 } } Enjoy.')).toBe('{ "a": { "b": 2 } }');
    expect(extractJson('  no json  ')).toBe('no json');
  });
});
