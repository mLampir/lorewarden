import type { Party } from '@lorewarden/core';
import { shallowRef } from 'vue';
import { onConnected, onPartiesChange } from '../lib/server';
import { deleteParty, listParties, saveParty } from '../storage/database';

const parties = shallowRef<Party[]>([]);
const loaded = shallowRef(false);
let started = false;

async function refresh() {
  try {
    parties.value = await listParties();
    loaded.value = true;
  } catch {
    // The server is not running; the parties load once it is back.
  }
}

/**
 * The game master's parties, kept by the Lorewarden server next to the own monsters and shared by
 * every view. Changes another tab makes appear on their own.
 */
export function useParties() {
  if (!started) {
    started = true;
    void refresh();
    onPartiesChange(() => void refresh());
    onConnected(() => void refresh());
  }

  async function save(party: Party) {
    await saveParty(party);
    const others = parties.value.filter((p) => p.id !== party.id);
    parties.value = [...others, JSON.parse(JSON.stringify(party)) as Party].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  async function remove(id: string) {
    await deleteParty(id);
    parties.value = parties.value.filter((p) => p.id !== id);
  }

  return { parties, loaded, save, remove, refresh };
}
