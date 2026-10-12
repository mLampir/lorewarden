<script setup lang="ts">
import { type Adventure, cluesKnownBy, npcMonster } from '@lorewarden/core';
import { Swords, Users } from '@lucide/vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import NpcCard from './NpcCard.vue';
import NpcClues from './NpcClues.vue';

/**
 * The NPCs of the adventure who are not in the current scene, one line each and folded open on
 * a click, so one can be brought in wherever the party goes.
 */
const props = defineProps<{
  adventure: Adventure;
  foundClueIds: string[];
  currentSceneId?: string | undefined;
}>();
const emit = defineEmits<{ toggle: [clueId: string]; addNpc: [npcId: string] }>();
const { t } = useI18n();

const others = computed(() => {
  const here = props.adventure.scenes.find((s) => s.id === props.currentSceneId)?.npcIds ?? [];
  return props.adventure.npcs.filter((npc) => !here.includes(npc.id));
});

function npcClues(npcId: string) {
  return cluesKnownBy(props.adventure, npcId);
}
</script>

<template>
  <section v-if="others.length > 0" class="stack other-npcs">
    <h3 class="section-title">
      <Users aria-hidden="true" />{{ t('live.otherNpcs') }}<span class="count">{{ others.length }}</span>
    </h3>
    <details v-for="npc in others" :key="npc.id" class="npc">
      <summary>
        <span class="npc-line">
          <strong>{{ npc.name }}</strong>
          <span v-if="npc.role" class="muted">{{ npc.role }}</span>
        </span>
        <span v-if="npc.voice" class="npc-voice">{{ npc.voice }}</span>
      </summary>
      <NpcCard :npc="npc" :monster="npcMonster(adventure, npc)" bare>
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
</template>

<style scoped>
.other-npcs {
  margin-top: 0.75rem;
}

.npc {
  border-bottom: 1px solid var(--border);
  padding-bottom: 0.5rem;
}

.npc summary {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  cursor: pointer;
}

.npc-line {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.4rem;
}

.npc-voice {
  font-size: 0.875rem;
  color: var(--muted);
}

.npc[open] summary {
  margin-bottom: 0.5rem;
}
</style>
