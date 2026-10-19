import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type Adventure,
  createMonster,
  createParty,
  parseAdventure,
  startSession,
} from '@lorewarden/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Store, slug } from '../src/store';

const example = new URL('../../../examples/lantern-in-the-marsh.adventure.json', import.meta.url);

async function loadExample(): Promise<Adventure> {
  const { readFile } = await import('node:fs/promises');
  const result = parseAdventure(await readFile(example, 'utf8'));
  if (!result.ok) throw new Error('Example does not parse');
  return result.adventure;
}

describe('store', () => {
  let dir: string;
  let store: Store;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lorewarden-store-'));
    store = new Store(dir);
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('keeps each adventure in a file named after its title', async () => {
    const adventure = await loadExample();
    await store.save(adventure);
    await store.save({ ...adventure, scenes: adventure.scenes.slice(0, 1) });
    await store.save({ ...adventure, id: 'adventure-copy' });
    expect(readdirSync(dir).sort()).toEqual([
      'the-lantern-in-the-marsh-2.adventure.json',
      'the-lantern-in-the-marsh.adventure.json',
    ]);
    expect((await store.get(adventure.id))?.scenes).toHaveLength(1);
    const { adventures } = await store.list();
    expect(adventures.map((a) => a.id).sort()).toEqual([adventure.id, 'adventure-copy'].sort());
  });

  it('reports files that are not adventures and skips them', async () => {
    writeFileSync(join(dir, 'broken.adventure.json'), '{ nope');
    writeFileSync(join(dir, 'notes.txt'), 'not an adventure');
    const { adventures, broken } = await store.list();
    expect(adventures).toEqual([]);
    expect(broken).toEqual([{ file: 'broken.adventure.json', problems: [expect.any(String)] }]);
  });

  it('lists a file it cannot read as broken and still lists the others', async () => {
    const adventure = await loadExample();
    await store.save(adventure);
    mkdirSync(join(dir, 'folder.adventure.json'));
    const { adventures, broken } = await store.list();
    expect(adventures.map((a) => a.id)).toEqual([adventure.id]);
    expect(broken).toEqual([{ file: 'folder.adventure.json', problems: [expect.any(String)] }]);
  });

  it('leaves adventure files from a newer version alone', async () => {
    const adventure = await loadExample();
    const newer = JSON.stringify({
      format: 'lorewarden.adventure',
      version: 99,
      adventure: { ...adventure, comingSoon: true },
    });
    writeFileSync(join(dir, 'newer.adventure.json'), newer);
    const { adventures, broken } = await store.list();
    expect(adventures).toEqual([]);
    expect(broken).toEqual([{ file: 'newer.adventure.json', problems: [expect.any(String)] }]);
    expect(await store.get(adventure.id)).toBeUndefined();
    await store.save(adventure);
    expect(readFileSync(join(dir, 'newer.adventure.json'), 'utf8')).toBe(newer);
  });

  it('keeps sessions and deletes them with their adventure', async () => {
    const adventure = await loadExample();
    await store.save(adventure);
    const first = startSession(adventure, undefined, new Date('2026-01-01T18:00:00Z'));
    const second = startSession(adventure, first, new Date('2026-01-08T18:00:00Z'));
    await store.saveSession(second);
    await store.saveSession(first);
    expect((await store.latestSession(adventure.id))?.id).toBe(second.id);
    expect(await store.delete(adventure.id)).toBe(true);
    expect(await store.latestSession(adventure.id)).toBeUndefined();
    expect(await store.delete(adventure.id)).toBe(false);
  });

  it('keeps a copy of a monster or party file it could not read in full', async () => {
    const monsters = '{ "format": "lorewarden.monsters", "version": 2, "monsters": [] }';
    writeFileSync(join(dir, 'monsters.json'), monsters);
    const parties = '{ "format": "lorewarden.parties", "version": 1, "parties": [{ "id": 1 }] }';
    writeFileSync(join(dir, 'parties.json'), parties);
    expect((await store.monsters()).problems).not.toEqual([]);
    expect((await store.parties()).problems).not.toEqual([]);

    await store.saveMonster(createMonster('Bog Imp'));
    await store.saveParty(createParty('Tuesday group'));
    await store.saveParty(createParty('Friday group'));
    expect((await store.monsters()).monsters.map((m) => m.name)).toEqual(['Bog Imp']);
    expect((await store.parties()).parties).toHaveLength(2);

    const copies = readdirSync(dir).filter((f) => f.includes('.bak-'));
    const copy = (name: string) => copies.filter((f) => f.startsWith(`${name}.bak-`));
    expect(copy('monsters.json')).toHaveLength(1);
    expect(copy('parties.json')).toHaveLength(1);
    expect(readFileSync(join(dir, copy('monsters.json')[0] ?? ''), 'utf8')).toBe(monsters);
    expect(readFileSync(join(dir, copy('parties.json')[0] ?? ''), 'utf8')).toBe(parties);
  });

  it('makes file names from titles', () => {
    expect(slug('Das Geheimnis der Mühle!')).toBe('das-geheimnis-der-muhle');
    expect(slug('???')).toBe('');
  });
});
