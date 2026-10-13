import { type Party, takeSignUps } from '@lorewarden/core';
import { shallowRef } from 'vue';
import { onConnected, onPartiesChange } from '../lib/server';
import { ChangedMeanwhile, deleteParty, loadParties, saveParty } from '../storage/database';

/** How often a save is tried again on a newer version of the parties. */
const SAVE_ATTEMPTS = 3;

const parties = shallowRef<Party[]>([]);
const loaded = shallowRef(false);
/** The version of the parties shown, which saves name so they cannot overwrite a newer one. */
let etag: string | undefined;
let started = false;

async function refresh() {
  try {
    const result = await loadParties();
    parties.value = result.parties;
    etag = result.etag;
    loaded.value = true;
  } catch {
    // The server is not running; the parties load once it is back.
  }
}

function sorted(list: Party[]): Party[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
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

  /**
   * Saves a party. When the parties changed since they were loaded, e.g. because a player entered
   * a character on their phone, what the phones entered is taken into the party and it is saved
   * again, so neither the game master's edit nor the player's character is lost.
   */
  async function save(party: Party) {
    let next = JSON.parse(JSON.stringify(party)) as Party;
    for (let attempt = 1; ; attempt++) {
      try {
        const sent = etag;
        const saved = await saveParty(next, sent);
        // Without a version to compare, the parties may hold changes not seen here yet.
        if (sent !== undefined) etag = saved;
        break;
      } catch (error) {
        if (!(error instanceof ChangedMeanwhile) || attempt >= SAVE_ATTEMPTS) throw error;
        const current = (error as ChangedMeanwhile<Party[]>).current;
        if (!current) throw error;
        parties.value = sorted(current.value);
        etag = current.etag;
        const stored = current.value.find((p) => p.id === next.id);
        if (stored) next = takeSignUps(next, stored);
      }
    }
    parties.value = sorted([...parties.value.filter((p) => p.id !== next.id), next]);
  }

  async function remove(id: string) {
    await deleteParty(id);
    parties.value = parties.value.filter((p) => p.id !== id);
  }

  return { parties, loaded, save, remove, refresh };
}
