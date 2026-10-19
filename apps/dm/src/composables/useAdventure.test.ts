import { type Adventure, createAdventure } from '@lorewarden/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';

/** A stand-in for the Lorewarden server: one adventure with a version counter as its ETag. */
const server = vi.hoisted(() => ({
  adventure: undefined as unknown,
  version: 1,
  saves: [] as (string | undefined)[],
  notify: (_change: { id: string; deleted: boolean }) => {},
}));

vi.mock('../lib/server', () => ({
  onAdventureChange: (listener: typeof server.notify) => {
    server.notify = listener;
    return () => {};
  },
  onConnected: () => () => {},
}));

vi.mock('../storage/database', () => {
  class ChangedMeanwhile<T> extends Error {
    constructor(readonly current: { value: T; etag: string | undefined } | undefined) {
      super('Changed meanwhile');
    }
  }
  const copy = () => JSON.parse(JSON.stringify(server.adventure)) as Adventure;
  return {
    ChangedMeanwhile,
    loadAdventure: async () => ({ adventure: copy(), etag: String(server.version) }),
    saveAdventure: async (adventure: Adventure, ifMatch?: string) => {
      server.saves.push(ifMatch);
      if (ifMatch !== undefined && ifMatch !== String(server.version)) {
        throw new ChangedMeanwhile({ value: copy(), etag: String(server.version) });
      }
      server.adventure = JSON.parse(JSON.stringify(adventure));
      server.version++;
      return String(server.version);
    },
  };
});

const { useAdventure } = await import('./useAdventure');

/** Another program saves a change, and the app hears of it. */
function changeElsewhere(change: (adventure: Adventure) => void) {
  const adventure = server.adventure as Adventure;
  change(adventure);
  server.version++;
  server.notify({ id: adventure.id, deleted: false });
}

async function settle() {
  for (let i = 0; i < 5; i++) {
    await vi.runAllTimersAsync();
    await nextTick();
  }
}

describe('useAdventure', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {} });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    server.adventure = createAdventure({ title: 'The Mill', partySize: 4, partyLevel: 3 });
    server.version = 1;
    server.saves = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function open() {
    const result = useAdventure(ref((server.adventure as Adventure).id));
    await settle();
    return result;
  }

  it('keeps an edit typed just before another program saved', async () => {
    const { adventure, conflict } = await open();
    if (!adventure.value) throw new Error('Not loaded');
    adventure.value.title = 'The Silent Mill';
    changeElsewhere((a) => {
      a.summary = 'Written by the AI.';
    });
    await settle();

    expect(adventure.value).toMatchObject({
      title: 'The Silent Mill',
      summary: 'Written by the AI.',
    });
    expect(server.adventure).toMatchObject({
      title: 'The Silent Mill',
      summary: 'Written by the AI.',
    });
    expect(conflict.value).toBe(false);
    // The first save ran into the newer version, the combined one was saved on top of it.
    expect(server.saves).toEqual(['1', '2']);
  });

  it('keeps the other change and says so when both changed the same field', async () => {
    const { adventure, conflict } = await open();
    if (!adventure.value) throw new Error('Not loaded');
    adventure.value.title = 'Mine';
    changeElsewhere((a) => {
      a.title = 'Theirs';
    });
    await settle();

    expect(adventure.value.title).toBe('Theirs');
    expect((server.adventure as Adventure).title).toBe('Theirs');
    expect(conflict.value).toBe(true);
  });

  it('loads a change made elsewhere when nothing is edited here', async () => {
    const { adventure, conflict } = await open();
    changeElsewhere((a) => {
      a.summary = 'Written by the AI.';
    });
    await settle();
    expect(adventure.value?.summary).toBe('Written by the AI.');
    expect(server.saves).toEqual([]);
    expect(conflict.value).toBe(false);
  });
});
