import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Adventure, parseAdventure, startSession } from '@lorewarden/core';
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

  it('makes file names from titles', () => {
    expect(slug('Das Geheimnis der Mühle!')).toBe('das-geheimnis-der-muhle');
    expect(slug('???')).toBe('');
  });
});
