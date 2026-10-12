<script setup lang="ts">
import type { Clue, ClueLead } from '@lorewarden/core';
import { ArrowRight } from '@lucide/vue';
import NotesText from './NotesText.vue';
import TermText from './TermText.vue';

/**
 * A clue to tick off at the table: first what the party comes across (the leads of this place),
 * then the truth they learn from it.
 */
defineProps<{ clue: Clue; leads: ClueLead[]; found: boolean }>();
const emit = defineEmits<{ toggle: [] }>();
</script>

<template>
  <div class="clue-check">
    <label class="clue" :class="{ found }">
      <input type="checkbox" :checked="found" @change="emit('toggle')" />
      <span class="clue-body">
        <span v-for="(lead, i) in leads" :key="i" class="clue-lead">
          <TermText :text="lead.text" />
        </span>
        <span class="clue-truth" :class="{ led: leads.length > 0 }">
          <ArrowRight v-if="leads.length > 0" aria-hidden="true" />
          <span>{{ clue.text }}</span>
        </span>
      </span>
    </label>
    <NotesText v-if="clue.notes" class="muted clue-notes" :text="clue.notes" />
  </div>
</template>

<style scoped>
.clue {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  cursor: pointer;
}

.clue input {
  margin-top: 0.3rem;
}

.clue-body {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

/* With leads, the truth is the consequence of what the party found: quieter, behind an arrow. */
.clue-truth.led {
  display: flex;
  align-items: flex-start;
  gap: 0.3rem;
  font-size: 0.9rem;
  color: var(--muted);
}

.clue-truth svg {
  flex: none;
  width: 0.9rem;
  height: 0.9rem;
  margin-top: 0.2rem;
  color: var(--accent);
}

.found .clue-body {
  color: var(--muted);
}

.found .clue-truth > span {
  text-decoration: line-through;
}

.clue-notes {
  margin: 0.2rem 0 0 1.6rem;
  font-size: 0.875rem;
}
</style>
