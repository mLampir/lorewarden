import { describe, expect, it } from 'vitest';
import { slugify } from './download';
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
