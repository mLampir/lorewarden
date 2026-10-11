import { describe, expect, it } from 'vitest';
import { slugify } from './download';
import { extractJson } from './extract-json';
import { fillIfBlank } from './fallback';
import { fitWithin, titleFromFileName } from './image';
import { languageOptions } from './languages';

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

describe('languageOptions', () => {
  it('names languages in the interface language and sorts them by name', () => {
    const options = languageOptions('de');
    expect(options.find((o) => o.tag === 'es')?.name).toBe('Spanisch');
    const names = options.map((o) => o.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'de')));
  });

  it('keeps a language that is not in the list', () => {
    expect(languageOptions('en').map((o) => o.tag)).not.toContain('pt-BR');
    expect(languageOptions('en', 'pt-BR').map((o) => o.tag)).toContain('pt-BR');
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

describe('images', () => {
  it('scales large images down and keeps small ones', () => {
    expect(fitWithin(5120, 2560, 2560)).toEqual({ width: 2560, height: 1280 });
    expect(fitWithin(1000, 3000, 2560)).toEqual({ width: 853, height: 2560 });
    expect(fitWithin(800, 600, 2560)).toEqual({ width: 800, height: 600 });
  });

  it('uses the file name without extension as the title', () => {
    expect(titleFromFileName('Old Mill (floor 1).png')).toBe('Old Mill (floor 1)');
    expect(titleFromFileName('.png')).toBe('.png');
  });
});
