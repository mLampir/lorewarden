<script setup lang="ts">
import { type Adventure, clueSceneIds, cluesKnownBy, leadPlace, openClues } from '@lorewarden/core';
import { MapPin, Search, Swords, Users } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import ClueCheck from './ClueCheck.vue';
import NpcCard from './NpcCard.vue';
import NpcClues from './NpcClues.vue';

/**
 * The fallback for improvising when the party leaves the plan: every clue still open, from all
 * scenes, and every NPC in short form, so one can be dropped in anywhere.
 */
const props = defineProps<{
  adventure: Adventure;
  foundClueIds: string[];
  currentSceneId?: string | undefined;
}>();
const emit = defineEmits<{ toggle: [clueId: string]; addNpc: [npcId: string] }>();
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

const here = computed(
  () => props.adventure.scenes.find((s) => s.id === props.currentSceneId)?.npcIds ?? [],
);

function npcClues(npcId: string) {
  return cluesKnownBy(props.adventure, npcId);
}
</script>

<template>
  <div class="stack improvise">
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

    <section class="stack">
      <h3 class="section-title">
        <Users aria-hidden="true" />{{ t('live.allNpcs') }}<span class="count">{{ adventure.npcs.length }}</span>
      </h3>
      <p v-if="adventure.npcs.length === 0" class="hint">{{ t('live.noNpcsAtAll') }}</p>
      <details v-for="npc in adventure.npcs" :key="npc.id" class="npc">
        <summary>
          <span class="npc-line">
            <strong>{{ npc.name }}</strong>
            <span v-if="npc.role" class="muted">{{ npc.role }}</span>
            <span v-if="here.includes(npc.id)" class="pill">{{ t('live.inThisScene') }}</span>
          </span>
          <span v-if="npc.voice" class="npc-voice">{{ npc.voice }}</span>
        </summary>
        <NpcCard :npc="npc" bare>
          <template v-if="npcClues(npc.id).length > 0" #clues>
            <NpcClues
              :clues="npcClues(npc.id)"
              :found-clue-ids="foundClueIds"
              @toggle="emit('toggle', $event)"
            />
          </template>
          <button class="small" @click="emit('addNpc', npc.id)">
            <Swords aria-hidden="true" />{{ t('live.addToInitiative') }}
          </button>
        </NpcCard>
      </details>
    </section>
  </div>
</template>

<style scoped>
.improvise {
  gap: 1.25rem;
}

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

.found summary,
.npc summary {
  cursor: pointer;
}

.npc {
  border-bottom: 1px solid var(--border);
  padding-bottom: 0.5rem;
}

.npc summary {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.npc-line {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.4rem;
}

.npc-line .pill {
  font-size: 0.75rem;
  padding: 0.05rem 0.5rem;
}

.npc-voice {
  font-size: 0.875rem;
  color: var(--muted);
}

.npc[open] summary {
  margin-bottom: 0.5rem;
}
</style>
