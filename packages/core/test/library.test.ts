import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseLibrary, serializeLibrary, toggleId, upsertById } from '../src';

const Thing = z.object({ id: z.string(), name: z.string().min(1) });
const things = {
  format: 'lorewarden.things',
  version: 1,
  migrations: {},
  key: 'things',
  entry: Thing,
  wrongFormat: 'Not a thing file',
};

describe('library files', () => {
  it('writes entries sorted by name and reads them back', () => {
    const text = serializeLibrary(things, [
      { id: 'b', name: 'Bee' },
      { id: 'a', name: 'Ant' },
    ]);
    expect(parseLibrary(things, text)).toEqual({
      entries: [
        { id: 'a', name: 'Ant' },
        { id: 'b', name: 'Bee' },
      ],
      problems: [],
    });
  });

  it('skips broken entries and reports them', () => {
    const text = JSON.stringify({ format: 'lorewarden.things', version: 1, things: [{ id: 'x' }] });
    const { entries, problems } = parseLibrary(things, text);
    expect(entries).toEqual([]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^things\[0\]\.name: /);
    expect(parseLibrary(things, '{}').problems).toEqual(['Not a thing file']);
  });

  it('brings an older file up to date and leaves a newer one alone', () => {
    // Version 2 renamed "label" to "name".
    const things2 = {
      ...things,
      version: 2,
      migrations: {
        1: (file: Record<string, unknown>) => ({
          ...file,
          things: (file.things as { id: string; label: string }[]).map(({ id, label }) => ({
            id,
            name: label,
          })),
        }),
      },
    };
    const old = JSON.stringify({
      format: 'lorewarden.things',
      version: 1,
      things: [{ id: 'a', label: 'Ant' }],
    });
    expect(parseLibrary(things2, old)).toEqual({
      entries: [{ id: 'a', name: 'Ant' }],
      problems: [],
    });
    const newer = JSON.stringify({ format: 'lorewarden.things', version: 3, things: [] });
    expect(parseLibrary(things2, newer).problems).toEqual([
      'Made with a newer Lorewarden (file version 3); update Lorewarden to open it',
    ]);
  });

  it('replaces an entry by id or adds it', () => {
    const list = [{ id: 'a', name: 'Ant' }];
    expect(upsertById(list, { id: 'a', name: 'Aphid' })).toEqual([{ id: 'a', name: 'Aphid' }]);
    expect(upsertById(list, { id: 'b', name: 'Bee' })).toHaveLength(2);
  });

  it('toggles an id in a list', () => {
    expect(toggleId(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleId(['a', 'b'], 'a')).toEqual(['b']);
  });
});
