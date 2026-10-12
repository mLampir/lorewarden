<script setup lang="ts">
import type { Npc, ResolvedMonster } from '@lorewarden/core';
import { useI18n } from 'vue-i18n';
import { useSettings } from '../composables/useSettings';
import MonsterDetails from './MonsterDetails.vue';
import NotesText from './NotesText.vue';
import TermText from './TermText.vue';

/** monster is the stat block of an NPC who may fight. */
defineProps<{ npc: Npc; monster?: ResolvedMonster | undefined }>();

const { t } = useI18n();
const { term } = useSettings();
</script>

<template>
  <article class="card entity">
    <header>
      <h3>{{ npc.name }}</h3>
      <span v-if="npc.role" class="muted">{{ npc.role }}</span>
    </header>
    <p v-if="npc.voice" class="voice">
      <strong>{{ t('npcs.voice') }}:</strong> {{ npc.voice }}
    </p>
    <p v-if="npc.description"><TermText :text="npc.description" /></p>
    <NotesText v-if="npc.notes" class="secret" :text="npc.notes" />
    <details v-if="monster" class="npc-stats">
      <summary>
        {{ t('npcs.stats') }}
        <span class="muted">
          <template v-if="monster.ac !== undefined">{{ term('statBlock.ac') }} {{ monster.ac }}</template>
          <template v-if="monster.hp !== undefined"> · {{ term('statBlock.hp') }} {{ monster.hp }}</template>
        </span>
      </summary>
      <MonsterDetails :monster="monster" />
    </details>
    <slot name="clues" />
    <div v-if="npc.tags.length > 0" class="row">
      <span v-for="tag in npc.tags" :key="tag" class="tag">{{ tag }}</span>
    </div>
    <div class="row actions"><slot /></div>
  </article>
</template>

<style scoped>
.npc-stats summary {
  cursor: pointer;
  font-weight: 600;
}

/* Shown first so the voice is at hand the moment the NPC speaks. */
.voice {
  border-left: 3px solid var(--accent);
  padding-left: 0.6rem;
}
</style>
