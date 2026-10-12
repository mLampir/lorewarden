import type { Adventure } from '@lorewarden/core';
import { computed, onBeforeUnmount, type Ref, ref, watch } from 'vue';
import { onAdventureChange, onConnected } from '../lib/server';
import { getAdventure, saveAdventure } from '../storage/database';
import { useAutosave } from './useAutosave';

/**
 * Loads an adventure from the Lorewarden server and saves every change back. When an AI assistant
 * or another tab changes it, the new version is loaded.
 */
export function useAdventure(id: Ref<string>) {
  const adventure = ref<Adventure>();
  const loading = ref(true);
  const {
    failed: saveFailed,
    pending: savePending,
    markSaved,
    flush,
  } = useAutosave(adventure, saveAdventure);

  async function load(value: string) {
    try {
      const loaded = await getAdventure(value);
      markSaved(loaded);
      adventure.value = loaded;
    } catch {
      // The server is not running; the banner says so.
    }
  }

  watch(
    id,
    async (value) => {
      await flush();
      loading.value = true;
      await load(value);
      loading.value = false;
    },
    { immediate: true },
  );

  const stop = onAdventureChange((change) => {
    if (change.id !== id.value) return;
    if (change.deleted) adventure.value = undefined;
    else void load(change.id);
  });
  // Opened while the server was not running: load once it is back.
  const stopConnected = onConnected(() => {
    if (!adventure.value) void load(id.value);
  });
  onBeforeUnmount(() => {
    stop();
    stopConnected();
  });

  const scenesById = computed(() => new Map(adventure.value?.scenes.map((s) => [s.id, s])));
  const npcsById = computed(() => new Map(adventure.value?.npcs.map((n) => [n.id, n])));
  const itemsById = computed(() => new Map(adventure.value?.items.map((i) => [i.id, i])));

  return { adventure, loading, saveFailed, savePending, scenesById, npcsById, itemsById };
}
