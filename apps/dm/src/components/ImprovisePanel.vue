<script setup lang="ts">
import { type Adventure, clueSceneIds, leadPlace, openClues } from '@lorewarden/core';
import { MapPin, Search } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import ClueCheck from './ClueCheck.vue';

/**
 * The fallback for improvising when the party leaves the plan: every clue still open, from all
 * scenes, with the ways to find it, so one can be dropped in anywhere.
 */
const props = defineProps<{
  adventure: Adventure;
  foundClueIds: string[];
}>();
const emit = defineEmits<{ toggle: [clueId: string] }>();
const { t } = useI18n();

const sceneTitle = (id: string) => props.adventure.scenes.find((s) => s.id === id)?.title ?? id;

const open = computed(() =>
  openClues(props.adventure, props.foundClueIds).map(({ clue, leads }) => ({
    clue,
    leads,
    places: leads.map((lead) => leadPlace(props.adventure, lead)),
    // Without leads, the scenes listed on the clue say where it turns up.
    scenes: leads.length === 0 ? clueSceneIds(props.adventure, clue).map(sceneTitle) : [],
  })),
);

const found = computed(() =>
  props.adventure.clues.filter((clue) => props.foundClueIds.includes(clue.id)),
);
</script>

<template>
  <section class="stack">
    <h3 class="section-title">
      <Search aria-hidden="true" />{{ t('live.openClues') }}<span class="count">{{ open.length }}</span>
    </h3>
    <ul v-if="open.length > 0" class="list stack">
      <li v-for="entry in open" :key="entry.clue.id">
        <ClueCheck
          :clue="entry.clue"
          :leads="entry.leads"
          :places="entry.places"
          :found="false"
          @toggle="emit('toggle', entry.clue.id)"
        />
        <p v-if="entry.scenes.length > 0" class="where">
          <MapPin aria-hidden="true" />{{ entry.scenes.join(' · ') }}
        </p>
      </li>
    </ul>
    <p v-else class="hint">
      {{ adventure.clues.length === 0 ? t('live.noClues') : t('live.allCluesFound') }}
    </p>
    <details v-if="found.length > 0" class="found">
      <summary class="muted">{{ t('live.foundClues', { count: found.length }) }}</summary>
      <ul class="list stack">
        <li v-for="clue in found" :key="clue.id">
          <ClueCheck :clue="clue" :leads="[]" :found="true" @toggle="emit('toggle', clue.id)" />
        </li>
      </ul>
    </details>
  </section>
</template>

<style scoped>
.where {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  margin: 0.15rem 0 0 1.6rem;
  font-size: 0.8rem;
  color: var(--muted);
}

.where svg {
  width: 0.8rem;
  height: 0.8rem;
}

.found summary {
  cursor: pointer;
}

</style>
