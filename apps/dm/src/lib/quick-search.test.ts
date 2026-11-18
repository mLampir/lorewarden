import { describe, expect, it } from 'vitest';
import { createSearch, matchScore, normalize, type SearchEntry } from './quick-search';

const entry = (
  group: SearchEntry<string>['group'],
  name: string,
  extra: Partial<SearchEntry<string>> = {},
): SearchEntry<string> => ({ key: `${group}:${name}`, group, name, target: name, ...extra });

const names = (results: { entries: SearchEntry<string>[] }[]) =>
  results.flatMap((group) => group.entries.map((e) => e.name));

describe('matchScore', () => {
  it('ranks the same name over its start, a word start, the middle and letters in order', () => {
    const scores = [
      matchScore('goblin', 'goblin'),
      matchScore('gob', 'goblin boss'),
      matchScore('boss', 'goblin boss'),
      matchScore('lin', 'goblin boss'),
      matchScore('gbb', 'goblin boss'),
    ];
    expect(scores.every((s) => s !== undefined)).toBe(true);
    expect([...scores].sort((a, b) => (b ?? 0) - (a ?? 0))).toEqual(scores);
  });

  it('finds words of the query in any order', () => {
    expect(matchScore('boss gob', 'goblin boss')).toBeDefined();
  });

  it('does not match letters that are not there in order', () => {
    expect(matchScore('xyz', 'goblin boss')).toBeUndefined();
    expect(matchScore('bg', 'goblin boss')).toBeUndefined();
    expect(matchScore('gob', 'gelatinous cube')).toBeUndefined();
  });
});

describe('normalize', () => {
  it('ignores case, accents and extra spaces', () => {
    expect(normalize('  Grüner   Drache ')).toBe('gruner drache');
  });
});

describe('createSearch', () => {
  const { search } = createSearch([
    entry('monsters', 'Goblin Boss'),
    entry('monsters', 'Goblin Warrior'),
    entry('monsters', 'Hobgoblin Warrior'),
    entry('npcs', 'Bertha', { text: 'A tall woman who runs the ferry' }),
    entry('rules', 'Armor Class', { aliases: ['AC'] }),
    entry('rules', 'Poisoned', { aliases: ['Vergiftet'] }),
    entry('scenes', 'The Ferry Crossing', { boost: 5 }),
  ]);

  it('finds "gobl" in Goblin Boss, with names that start with it first', () => {
    expect(names(search('gobl'))).toEqual(['Goblin Boss', 'Goblin Warrior', 'Hobgoblin Warrior']);
  });

  it('groups results by kind, the group with the best match first', () => {
    const results = search('ferry');
    expect(results.map((group) => group.group)).toEqual(['scenes', 'npcs']);
  });

  it('finds rules by their other names', () => {
    expect(names(search('ac'))[0]).toBe('Armor Class');
    expect(names(search('vergift'))).toEqual(['Poisoned']);
  });

  it('limits the results per group', () => {
    expect(names(search('gob', 2))).toHaveLength(2);
  });

  it('finds nothing for an empty query', () => {
    expect(search('   ')).toEqual([]);
  });
});
