<script setup lang="ts">
import {
  addLogNote,
  editLogEntry,
  type LogEntry,
  removeLogEntry,
  type Session,
} from '@lorewarden/core';
import { computed, nextTick, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { downloadText, slugify } from '../lib/download';

const session = defineModel<Session>('session', { required: true });
const props = defineProps<{ adventureTitle: string }>();
const { t, d } = useI18n();

const note = ref('');
const editingId = ref<string>();
const editText = ref('');
const editInput = ref<HTMLTextAreaElement[]>();

const newestFirst = computed(() => [...session.value.log].reverse());

function add() {
  session.value = addLogNote(session.value, note.value);
  note.value = '';
}

async function startEdit(entry: LogEntry) {
  editingId.value = entry.id;
  editText.value = entry.text;
  await nextTick();
  editInput.value?.[0]?.focus();
}

function saveEdit() {
  if (editingId.value) {
    session.value = editLogEntry(session.value, editingId.value, editText.value);
  }
  editingId.value = undefined;
}

function remove(entry: LogEntry) {
  if (window.confirm(t('log.deleteConfirm'))) {
    session.value = removeLogEntry(session.value, entry.id);
  }
}

function line(entry: LogEntry) {
  return entry.kind === 'scene' ? t('log.movedTo', { scene: entry.text }) : entry.text;
}

function exportMarkdown() {
  const started = new Date(session.value.startedAt);
  const lines = [
    `# ${props.adventureTitle}`,
    '',
    t('log.exportHeading', { date: d(started, 'long') }),
    '',
    ...session.value.log.map((entry) => `- ${d(new Date(entry.at), 'time')} ${line(entry)}`),
    '',
  ];
  const day = session.value.startedAt.slice(0, 10);
  downloadText(`${slugify(props.adventureTitle)}-${day}.md`, lines.join('\n'), 'text/markdown');
}
</script>

<template>
  <section class="card stack" :aria-label="t('log.heading')">
    <header class="row spread">
      <h2>{{ t('log.heading') }}</h2>
      <button class="small" :disabled="session.log.length === 0" @click="exportMarkdown">
        {{ t('log.export') }}
      </button>
    </header>
    <form class="row" @submit.prevent="add">
      <input
        v-model="note"
        class="grow"
        :placeholder="t('log.placeholder')"
        :aria-label="t('log.placeholder')"
      />
      <button type="submit" :disabled="note.trim() === ''">{{ t('log.add') }}</button>
    </form>
    <ol class="list entries">
      <li v-for="entry in newestFirst" :key="entry.id" :class="['entry', entry.kind]">
        <time :datetime="entry.at" class="hint">{{ d(new Date(entry.at), 'time') }}</time>
        <template v-if="editingId === entry.id">
          <textarea
            ref="editInput"
            v-model="editText"
            rows="2"
            @keydown.enter.exact.prevent="saveEdit"
            @keydown.escape="editingId = undefined"
            @blur="saveEdit"
          />
        </template>
        <template v-else>
          <span class="text">{{ line(entry) }}</span>
          <span v-if="entry.kind === 'note'" class="entry-actions">
            <button class="small" :aria-label="t('common.edit')" @click="startEdit(entry)">✎</button>
            <button class="small danger" :aria-label="t('common.delete')" @click="remove(entry)">
              ×
            </button>
          </span>
        </template>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.spread {
  justify-content: space-between;
}

h2 {
  margin: 0;
  font-size: 1.125rem;
}

.grow {
  flex: 1;
}

.entries {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  max-height: 24rem;
  overflow: auto;
}

.entry {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.5rem;
  align-items: start;
}

.entry time {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.entry.scene .text {
  font-weight: 600;
  color: var(--accent);
}

.text {
  white-space: pre-line;
}

.entry-actions {
  display: flex;
  gap: 0.2rem;
  opacity: 0.5;
}

.entry:hover .entry-actions,
.entry-actions:focus-within {
  opacity: 1;
}
</style>
