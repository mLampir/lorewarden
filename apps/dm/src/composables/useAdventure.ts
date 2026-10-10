import type { Adventure } from '@lorewarden/core';
import { computed, type Ref, ref, watch } from 'vue';
import { getAdventure, saveAdventure } from '../storage/database';
import { useAutosave } from './useAutosave';

/** Loads an adventure from local storage and saves every change back. */
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

  const scenesById = computed(() => new Map(adventure.value?.scenes.map((s) => [s.id, s])));
  const npcsById = computed(() => new Map(adventure.value?.npcs.map((n) => [n.id, n])));
  const itemsById = computed(() => new Map(adventure.value?.items.map((i) => [i.id, i])));

  return { adventure, loading, saveFailed, scenesById, npcsById, itemsById };
}
