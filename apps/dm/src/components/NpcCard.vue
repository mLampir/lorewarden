<script setup lang="ts">
import type { Npc } from '@lorewarden/core';
import { useI18n } from 'vue-i18n';
import NotesText from './NotesText.vue';
import TermText from './TermText.vue';

defineProps<{ npc: Npc }>();

const { t } = useI18n();
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
    <slot name="clues" />
    <div v-if="npc.tags.length > 0" class="row">
      <span v-for="tag in npc.tags" :key="tag" class="tag">{{ tag }}</span>
    </div>
    <div class="row actions"><slot /></div>
  </article>
</template>

<style scoped>
/* Shown first so the voice is at hand the moment the NPC speaks. */
.voice {
  border-left: 3px solid var(--accent);
  padding-left: 0.6rem;
}
</style>
