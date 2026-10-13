import { Adventure } from '@lorewarden/core';
import { computed, onBeforeUnmount, type Ref, ref, watch } from 'vue';
import { mergeChanges } from '../lib/merge';
import { onAdventureChange, onConnected } from '../lib/server';
import { ChangedMeanwhile, loadAdventure, saveAdventure } from '../storage/database';
import { useAutosave } from './useAutosave';

/**
 * Loads an adventure from the Lorewarden server and saves every change back. When an AI assistant
 * or another tab changes it, the new version is loaded.
 *
 * Every save names the version it is based on. When another one was saved meanwhile, or a
 * notice says so, the edits made here that are not saved yet are combined with it (see
 * mergeChanges) and saved on top, instead of one side overwriting the other. Where both changed
 * the same field, the other change wins and conflict tells the game master to check their edit.
 */
export function useAdventure(id: Ref<string>) {
  const adventure = ref<Adventure>();
  const loading = ref(true);
  /** An edit made here clashed with a change saved elsewhere, which was kept instead. */
  const conflict = ref(false);
  /** The version on the server the edits here are based on, as JSON, and its ETag. */
  let base: string | undefined;
  let etag: string | undefined;

  const {
    failed: saveFailed,
    pending: savePending,
    markSaved,
    flush,
    serially,
  } = useAutosave(adventure, save);

  async function save(value: Adventure) {
    const sent = JSON.stringify(value);
    try {
      etag = await saveAdventure(value, etag);
      base = sent;
    } catch (error) {
      if (!(error instanceof ChangedMeanwhile)) throw error;
      takeNewer((error as ChangedMeanwhile<Adventure>).current);
    }
  }

  /** Shows a newer version saved elsewhere, with the edits made here that it does not have. */
  function takeNewer(current: { value: Adventure; etag: string | undefined } | undefined) {
    if (!current) {
      // Deleted elsewhere.
      base = undefined;
      etag = undefined;
      markSaved(undefined);
      adventure.value = undefined;
      return;
    }
    const local = adventure.value;
    let next = current.value;
    if (local && base !== undefined && JSON.stringify(local) !== base) {
      const merged = mergeChanges<unknown>(
        JSON.parse(base),
        JSON.parse(JSON.stringify(local)),
        next,
      );
      const parsed = Adventure.safeParse(merged.value);
      if (parsed.success) next = parsed.data;
      if (merged.conflict || !parsed.success) conflict.value = true;
    }
    base = JSON.stringify(current.value);
    etag = current.etag;
    // The newer version is what is saved; the combined edits are saved on top of it.
    markSaved(current.value);
    adventure.value = next;
  }

  async function load(value: string) {
    try {
      const loaded = await loadAdventure(value);
      base = loaded && JSON.stringify(loaded.adventure);
      etag = loaded?.etag;
      markSaved(loaded?.adventure);
      adventure.value = loaded?.adventure;
    } catch {
      // The server is not running; the banner says so.
    }
  }

  /** Loads the version saved elsewhere, if it is newer than the one the edits are based on. */
  async function refresh(value: string) {
    if (value !== id.value) return;
    try {
      const loaded = await loadAdventure(value);
      if (value !== id.value || (loaded && loaded.etag !== undefined && loaded.etag === etag)) {
        return;
      }
      takeNewer(loaded && { value: loaded.adventure, etag: loaded.etag });
    } catch {
      // The server is not running; the banner says so.
    }
  }

  watch(
    id,
    async (value) => {
      await flush();
      loading.value = true;
      conflict.value = false;
      await serially(() => load(value));
      loading.value = false;
    },
    { immediate: true },
  );

  const stop = onAdventureChange((change) => {
    if (change.id !== id.value) return;
    if (change.deleted) {
      adventure.value = undefined;
      return;
    }
    // Edits typed just now are saved first; if they clash, they are combined with the newer
    // version right there, and loading it again finds nothing new.
    void flush().then(() => serially(() => refresh(change.id)));
  });
  // Opened while the server was not running: load once it is back.
  const stopConnected = onConnected(() => {
    if (!adventure.value) void serially(() => load(id.value));
  });
  onBeforeUnmount(() => {
    stop();
    stopConnected();
  });

  const scenesById = computed(() => new Map(adventure.value?.scenes.map((s) => [s.id, s])));
  const npcsById = computed(() => new Map(adventure.value?.npcs.map((n) => [n.id, n])));
  const itemsById = computed(() => new Map(adventure.value?.items.map((i) => [i.id, i])));

  return {
    adventure,
    loading,
    saveFailed,
    savePending,
    conflict,
    scenesById,
    npcsById,
    itemsById,
  };
}
