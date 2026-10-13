import { describe, expect, it } from 'vitest';
import { slugify } from './download';
import { extractJson } from './extract-json';
import { fillIfBlank } from './fallback';
import { fitWithin, titleFromFileName } from './image';
import { languageOptions } from './languages';
import { mergeChanges } from './merge';
import { clampInteger, parseInteger } from './numbers';
import { difficultyLabel } from './review';

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

describe('number fields', () => {
  it('reads whole numbers and leaves out empty or invalid fields', () => {
    expect(parseInteger('12')).toBe(12);
    expect(parseInteger('-3')).toBe(-3);
    expect(parseInteger('')).toBeUndefined();
    expect(parseInteger('abc')).toBeUndefined();
  });

  it('keeps required numbers in range and the previous value for an empty field', () => {
    expect(clampInteger('', 4, 1, 12)).toBe(4);
    expect(clampInteger('0', 4, 1, 12)).toBe(1);
    expect(clampInteger('99', 4, 1, 12)).toBe(12);
    expect(clampInteger('7', 4, 1)).toBe(7);
  });
});

describe('difficultyLabel', () => {
  it('translates known difficulties and keeps other text', () => {
    const t = (key: string) => `[${key}]`;
    expect(difficultyLabel(t, 'moderate')).toBe('[review.difficulty.moderate]');
    expect(difficultyLabel(t, 'deadly boss')).toBe('deadly boss');
  });
});

describe('mergeChanges', () => {
  const yard = { id: 'yard', title: 'Yard', tags: ['outside'] };
  const cellar = { id: 'cellar', title: 'Cellar', tags: [] as string[] };
  const base = {
    title: 'The Mill',
    summary: '',
    scenes: [yard, cellar],
    npcs: [{ id: 'miller', name: 'Miller' }],
  };

  it('keeps what each side changed', () => {
    const local = {
      ...base,
      title: 'The Silent Mill',
      npcs: [...base.npcs, { id: 'imp', name: 'Imp' }],
    };
    const remote = {
      ...base,
      summary: 'A haunted mill.',
      scenes: [{ ...yard, title: 'Mill yard' }, cellar],
    };
    const { value, conflict } = mergeChanges(base, local, remote);
    expect(conflict).toBe(false);
    expect(value.title).toBe('The Silent Mill');
    expect(value.summary).toBe('A haunted mill.');
    expect(value.scenes.map((s) => s.title)).toEqual(['Mill yard', 'Cellar']);
    expect(value.npcs.map((n) => n.id)).toEqual(['miller', 'imp']);
  });

  it('places entries added here after the entry before them and drops removed ones', () => {
    const local = { ...base, scenes: [yard, { id: 'mill', title: 'Mill', tags: [] }, cellar] };
    const remote = { ...base, scenes: [yard, { id: 'attic', title: 'Attic', tags: [] }] };
    const { value, conflict } = mergeChanges(base, local, remote);
    expect(conflict).toBe(false);
    expect(value.scenes.map((s) => s.id)).toEqual(['yard', 'mill', 'attic']);
  });

  it('takes the change saved elsewhere where both changed the same field', () => {
    const local = { ...base, title: 'Mine' };
    const remote = { ...base, title: 'Theirs', summary: 'Theirs too' };
    const { value, conflict } = mergeChanges(base, local, remote);
    expect(conflict).toBe(true);
    expect(value).toEqual(remote);
  });

  it('keeps an entry removed here that was changed elsewhere', () => {
    const local = { ...base, npcs: [] };
    const remote = { ...base, npcs: [{ id: 'miller', name: 'Old miller' }] };
    const { value, conflict } = mergeChanges(base, local, remote);
    expect(conflict).toBe(true);
    expect(value.npcs).toEqual(remote.npcs);
  });
});
