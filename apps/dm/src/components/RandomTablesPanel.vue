<script setup lang="ts">
import {
  type Adventure,
  addLogNote,
  builtinTables,
  type RandomTable,
  rolledTexts,
  rollInSession,
  rowRange,
  type Session,
  stripLinks,
  type TableRoll,
  tableDie,
  tableRows,
} from '@lorewarden/core';
import { BookOpen, Check, Dices, ScrollText, Swords } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import TermText from './TermText.vue';

/**
 * Tables the game master rolls on to improvise: the adventure's own, then the built-in ones in the
 * adventure's language. A result goes into the log or, for a fight, into the initiative.
 */
const session = defineModel<Session>('session', { required: true });
const props = defineProps<{ adventure: Adventure }>();
const emit = defineEmits<{ addEncounter: [encounterId: string] }>();
const { t, locale } = useI18n();

const builtin = computed(() => builtinTables(props.adventure.language ?? locale.value));

const groups = computed(() => [
  {
    key: 'adventure',
    title: t('randomTables.adventureTables'),
    icon: Dices,
    tables: props.adventure.randomTables,
  },
  { key: 'builtin', title: t('randomTables.builtinTables'), icon: BookOpen, tables: builtin.value },
]);

/** The last result of each table, until it is rolled again. */
const results = ref<Record<string, TableRoll & { logged: boolean }>>({});

function roll(table: RandomTable) {
  const rolled = rollInSession(session.value, table);
  session.value = rolled.session;
  if (rolled.roll)
    results.value = { ...results.value, [table.id]: { ...rolled.roll, logged: false } };
}

function addToLog(table: RandomTable) {
  const result = results.value[table.id];
  if (!result || result.logged) return;
  session.value = addLogNote(
    session.value,
    t('randomTables.logEntry', { title: table.title, text: stripLinks(result.entry.text) }),
  );
  result.logged = true;
}

function hasEncounter(id: string | undefined): id is string {
  return id !== undefined && props.adventure.encounters.some((e) => e.id === id);
}

/** Whether a result of a table without repeats has come up in this session. */
function used(table: RandomTable, text: string): boolean {
  return table.noRepeat && rolledTexts(session.value, table.id).includes(text);
}
</script>

<template>
  <div class="stack panel">
    <section v-for="group in groups" :key="group.key" class="stack">
      <h3 class="section-title">
        <component :is="group.icon" aria-hidden="true" />{{ group.title }}
        <span v-if="group.tables.length > 0" class="count">{{ group.tables.length }}</span>
      </h3>
      <p v-if="group.tables.length === 0" class="hint">{{ t('randomTables.noTables') }}</p>
      <article v-for="table in group.tables" :key="table.id" class="card roll-table">
        <div class="head">
          <span class="name">{{ table.title }}</span>
          <span v-if="table.entries.length > 0" class="muted die">d{{ tableDie(table) }}</span>
          <button
            class="small"
            :disabled="table.entries.length === 0"
            :aria-label="t('randomTables.rollOn', { title: table.title })"
            @click="roll(table)"
          >
            <Dices aria-hidden="true" />{{ t('randomTables.roll') }}
          </button>
        </div>
        <div v-if="results[table.id]" class="result" aria-live="polite">
          <p class="result-text">
            <span class="number">{{ results[table.id]?.roll }}</span>
            <TermText :text="results[table.id]?.entry.text ?? ''" />
          </p>
          <p v-if="results[table.id]?.reset" class="hint">{{ t('randomTables.startedOver') }}</p>
          <div class="row actions">
            <button
              class="small ghost"
              :disabled="results[table.id]?.logged"
              @click="addToLog(table)"
            >
              <template v-if="results[table.id]?.logged">
                <Check aria-hidden="true" />{{ t('randomTables.logged') }}
              </template>
              <template v-else>
                <ScrollText aria-hidden="true" />{{ t('randomTables.addToLog') }}
              </template>
            </button>
            <button
              v-if="hasEncounter(results[table.id]?.entry.encounterId)"
              class="small"
              @click="emit('addEncounter', results[table.id]?.entry.encounterId ?? '')"
            >
              <Swords aria-hidden="true" />{{ t('live.addToInitiative') }}
            </button>
          </div>
        </div>
        <details v-if="table.entries.length > 0" class="all">
          <summary class="muted">{{ t('randomTables.allEntries') }}</summary>
          <ol class="rows">
            <li
              v-for="row in tableRows(table)"
              :key="row.index"
              :class="{ used: used(table, row.entry.text) }"
            >
              <span class="range">{{ rowRange(row) }}</span>
              <span><TermText :text="row.entry.text" /></span>
            </li>
          </ol>
        </details>
      </article>
    </section>
  </div>
</template>

<style scoped>
.panel {
  gap: 1.25rem;
}

.roll-table {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.6rem 0.75rem;
}

.head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.name {
  flex: 1;
  min-width: 0;
  font-weight: 600;
}

.die {
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
}

.head button svg,
.actions svg {
  width: 0.95rem;
  height: 0.95rem;
}

.result {
  padding: 0.5rem 0.65rem;
  border-left: 3px solid var(--accent);
  border-radius: var(--radius-sm);
  background: var(--accent-soft);
}

.result-text {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  margin: 0;
}

.number {
  flex: none;
  min-width: 1.6rem;
  font-size: 1.15rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--accent);
  text-align: right;
}

.result .hint {
  margin: 0.3rem 0 0;
}

.actions {
  gap: 0.4rem;
  margin-top: 0.4rem;
}

.all summary {
  cursor: pointer;
  font-size: 0.85rem;
  width: fit-content;
}

.rows {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin: 0.4rem 0 0;
  padding: 0;
  list-style: none;
  font-size: 0.9rem;
}

.rows li {
  display: grid;
  grid-template-columns: 2.6rem minmax(0, 1fr);
  gap: 0.5rem;
}

.range {
  font-variant-numeric: tabular-nums;
  color: var(--muted);
  text-align: right;
}

/* Results that have come up in this session, for tables without repeats. */
.rows .used {
  color: var(--muted);
  text-decoration: line-through;
}
</style>
