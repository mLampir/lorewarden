import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ADVENTURE_FILE,
  type FileFormat,
  MONSTER_LIBRARY,
  PARTY_LIBRARY,
  parseAdventure,
  parseMonsterLibrary,
  parsePartyLibrary,
  parseSessionFile,
  readAdventureFile,
  SESSION_FILE,
  serializeSession,
  startSession,
  upgradeFile,
} from '../src';
import { example, loadExample } from './helpers';

// Version 3 of a made-up format: version 2 renamed "label" to "name", version 3 added "tags".
const notes: FileFormat = {
  format: 'lorewarden.notes',
  version: 3,
  migrations: {
    1: ({ label, ...file }) => ({ ...file, name: label }),
    2: (file) => ({ ...file, tags: [] }),
  },
  wrongFormat: 'Not a notes file',
};

describe('file versions', () => {
  it('brings an older file up to date step by step', () => {
    expect(upgradeFile({ format: 'lorewarden.notes', version: 1, label: 'Mill' }, notes)).toEqual({
      ok: true,
      file: { format: 'lorewarden.notes', version: 3, name: 'Mill', tags: [] },
    });
    expect(upgradeFile({ format: 'lorewarden.notes', version: 2, name: 'Mill' }, notes)).toEqual({
      ok: true,
      file: { format: 'lorewarden.notes', version: 3, name: 'Mill', tags: [] },
    });
  });

  it('leaves a file of the current version as it is', () => {
    const file = { format: 'lorewarden.notes', version: 3, name: 'Mill', tags: ['a'] };
    expect(upgradeFile(file, notes)).toEqual({ ok: true, file });
  });

  it('refuses files from a newer Lorewarden, of another format or without a version', () => {
    expect(upgradeFile({ format: 'lorewarden.notes', version: 4 }, notes)).toEqual({
      ok: false,
      problem: 'Made with a newer Lorewarden (file version 4); update Lorewarden to open it',
    });
    expect(upgradeFile({ format: 'other', version: 1 }, notes)).toEqual({
      ok: false,
      problem: 'Not a notes file',
    });
    expect(upgradeFile([], notes)).toEqual({ ok: false, problem: 'Not a notes file' });
    expect(upgradeFile({ format: 'lorewarden.notes' }, notes).ok).toBe(false);
    expect(upgradeFile({ format: 'lorewarden.notes', version: 0 }, notes).ok).toBe(false);
    expect(upgradeFile({ format: 'lorewarden.notes', version: 1.5 }, notes).ok).toBe(false);
  });

  it('has a step for every version of every format below the current one', () => {
    for (const format of [ADVENTURE_FILE, SESSION_FILE, MONSTER_LIBRARY, PARTY_LIBRARY]) {
      for (let version = 1; version < format.version; version++) {
        expect(format.migrations[version], `${format.format} ${version}`).toBeDefined();
      }
    }
  });
});

describe('adventure files', () => {
  it('reads an adventure that is still being edited when only the shape is checked', () => {
    const raw = JSON.parse(example);
    raw.adventure.scenes[0].exits[0].targetSceneId = 'scene-missing';
    const text = JSON.stringify(raw);
    expect(parseAdventure(text).ok).toBe(false);
    expect(readAdventureFile(text).ok).toBe(true);
  });

  it('refuses an adventure from a newer Lorewarden', () => {
    const raw = JSON.parse(example);
    raw.version = ADVENTURE_FILE.version + 1;
    const result = readAdventureFile(JSON.stringify(raw));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems[0]?.message).toMatch(/newer Lorewarden/);
  });
});

describe('session files', () => {
  it('writes a session with its format and version and reads it back', () => {
    const session = startSession(loadExample(), undefined, new Date('2026-01-01T00:00:00Z'));
    const text = serializeSession(session);
    expect(JSON.parse(text)).toMatchObject({ format: 'lorewarden.session', version: 1 });
    expect(parseSessionFile(text)).toEqual(session);
  });

  it('reads nothing from a file that is not a session', () => {
    expect(parseSessionFile('{ nope')).toBeUndefined();
    expect(parseSessionFile('{"format":"lorewarden.session","version":1}')).toBeUndefined();
    expect(parseSessionFile('{"format":"lorewarden.session","version":99,"session":{}}')).toBe(
      undefined,
    );
  });
});

// Files as each version of Lorewarden wrote them. They are never changed, so a change to a file
// format that forgets its migration step fails here. Add a file for every new version.
describe('files of every version', () => {
  const dir = new URL('./fixtures/', import.meta.url);
  const files = readdirSync(dir);
  const read = (file: string) => readFileSync(new URL(file, dir), 'utf8');

  it.each(files.filter((f) => f.endsWith('.adventure.json')))('reads %s', (file) => {
    expect(parseAdventure(read(file))).toMatchObject({ ok: true });
  });
  it.each(files.filter((f) => f.endsWith('.session.json')))('reads %s', (file) => {
    expect(parseSessionFile(read(file))).toBeDefined();
  });
  it.each(files.filter((f) => f.startsWith('monsters')))('reads %s', (file) => {
    const { monsters, problems } = parseMonsterLibrary(read(file));
    expect(problems).toEqual([]);
    expect(monsters.length).toBeGreaterThan(0);
  });
  it.each(files.filter((f) => f.startsWith('parties')))('reads %s', (file) => {
    const { parties, problems } = parsePartyLibrary(read(file));
    expect(problems).toEqual([]);
    expect(parties.length).toBeGreaterThan(0);
  });
});
