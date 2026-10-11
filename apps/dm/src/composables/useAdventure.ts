import type { Adventure } from '@lorewarden/core';
import { computed, onBeforeUnmount, type Ref, ref, watch } from 'vue';
import { getAdventure, onStorageChange, saveAdventure } from '../storage/database';
import { useAutosave } from './useAutosave';

/** Loads an adventure from local storage, saves every change back and picks up changes the AI assistant makes. */
export function useAdventure(id: Ref<string>) {
  const adventure = ref<Adventure>();
  const loading = ref(true);
  const { failed: saveFailed, markSaved, flush } = useAutosave(adventure, saveAdventure);

  watch(
    id,
    async (value) => {
      await flush();
      loading.value = true;
      const loaded = await getAdventure(value);
      markSaved(loaded);
      adventure.value = loaded;
      loading.value = false;
    },
    { immediate: true },
  );

  // Show changes the AI assistant makes while this adventure is open.
  const stopListening = onStorageChange(async (change) => {
    if (change.kind !== 'adventure' || !change.external || change.adventure.id !== id.value) return;
    await flush();
    markSaved(change.adventure);
    adventure.value = change.adventure;
  });
  onBeforeUnmount(stopListening);

  const scenesById = computed(() => new Map(adventure.value?.scenes.map((s) => [s.id, s])));
  const npcsById = computed(() => new Map(adventure.value?.npcs.map((n) => [n.id, n])));
  const itemsById = computed(() => new Map(adventure.value?.items.map((i) => [i.id, i])));

  return { adventure, loading, saveFailed, scenesById, npcsById, itemsById };
}
