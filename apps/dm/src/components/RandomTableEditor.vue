<script setup lang="ts">
import {
  type Adventure,
  type Encounter,
  entriesFromLines,
  type RandomTable,
  rowRange,
  tableDie,
  tableRows,
} from '@lorewarden/core';
import { Dices } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { fillIfBlank } from '../lib/fallback';
import { readNumberField } from '../lib/numbers';

const props = defineProps<{ adventure: Adventure; table: RandomTable }>();
const emit = defineEmits<{ remove: [] }>();

const { t } = useI18n();

const rows = computed(() => tableRows(props.table));

/** The scene and the monsters of an encounter, since encounters have no name of their own. */
function encounterLabel(encounter: Encounter): string {
  const scene = props.adventure.scenes.find(
    (s) => s.id === encounter.sceneId || s.encounterIds.includes(encounter.id),
  );
  const monsters = encounter.monsters
    .map((entry) => {
      const name =
        entry.name ??
        props.adventure.monsterPool.find((m) => m.id === entry.poolMonsterId)?.name ??
        entry.poolMonsterId;
      return `${entry.count}× ${name}`;
    })
    .join(', ');
  return scene ? `${scene.title}: ${monsters}` : monsters || encounter.id;
}

const newEntries = ref('');

function addEntries() {
  const entries = entriesFromLines(newEntries.value);
  if (entries.length === 0) return;
  props.table.entries.push(...entries);
  newEntries.value = '';
}

/** An entry emptied by the game master is removed. */
function tidyEntry(index: number) {
  if (props.table.entries[index]?.text.trim() === '') props.table.entries.splice(index, 1);
}

function moveEntry(index: number, by: -1 | 1) {
  const [entry] = props.table.entries.splice(index, 1);
  if (entry) props.table.entries.splice(index + by, 0, entry);
}

function setEncounter(index: number, event: Event) {
  const entry = props.table.entries[index];
  if (!entry) return;
  const id = (event.target as HTMLSelectElement).value;
  if (id) entry.encounterId = id;
  else delete entry.encounterId;
}
</script>

<template>
  <div class="card stack">
    <label class="field">
      <span>{{ t('randomTables.title') }}</span>
      <input
        v-model="table.title"
        required
        @blur="fillIfBlank(table, 'title', t('randomTables.newTitle'))"
      />
    </label>
    <label class="inline">
      <input v-model="table.noRepeat" type="checkbox" />
      {{ t('randomTables.noRepeat') }}
    </label>

    <fieldset class="stack">
      <legend>
        <Dices aria-hidden="true" />{{ t('randomTables.entries') }}
        <span v-if="table.entries.length > 0" class="count">d{{ tableDie(table) }}</span>
      </legend>
      <p class="hint">{{ t('randomTables.entriesHint') }}</p>
      <ol v-if="rows.length > 0" class="stack entries">
        <li v-for="row in rows" :key="row.index" class="entry">
          <span class="range" :aria-label="t('randomTables.range', { range: rowRange(row) })">
            {{ rowRange(row) }}
          </span>
          <textarea
            v-model="row.entry.text"
            rows="1"
            class="grow"
            :aria-label="t('randomTables.entryNumber', { n: row.index + 1 })"
            @blur="tidyEntry(row.index)"
          />
          <div class="row tools">
            <label class="inline weight" :title="t('randomTables.weightHint')">
              <span class="hint">{{ t('randomTables.weight') }}</span>
              <input
                :value="row.entry.weight"
                type="number"
                min="1"
                max="100"
                @change="row.entry.weight = readNumberField($event, row.entry.weight, 1, 100)"
              />
            </label>
            <select
              v-if="adventure.encounters.length > 0"
              :value="row.entry.encounterId ?? ''"
              :aria-label="t('randomTables.encounter')"
              @change="setEncounter(row.index, $event)"
            >
              <option value="">{{ t('randomTables.noEncounter') }}</option>
              <option v-for="encounter in adventure.encounters" :key="encounter.id" :value="encounter.id">
                {{ encounterLabel(encounter) }}
              </option>
            </select>
            <button
              class="small"
              type="button"
              :disabled="row.index === 0"
              :aria-label="t('puzzles.moveUp')"
              @click="moveEntry(row.index, -1)"
            >
              ↑
            </button>
            <button
              class="small"
              type="button"
              :disabled="row.index === table.entries.length - 1"
              :aria-label="t('puzzles.moveDown')"
              @click="moveEntry(row.index, 1)"
            >
              ↓
            </button>
            <button
              class="small danger"
              type="button"
              :aria-label="t('common.remove')"
              @click="table.entries.splice(row.index, 1)"
            >
              ×
            </button>
          </div>
        </li>
      </ol>
      <form class="stack" @submit.prevent="addEntries">
        <label class="field">
          <span>{{ t('randomTables.newEntries') }}</span>
          <textarea
            v-model="newEntries"
            rows="3"
            :placeholder="t('randomTables.newEntriesPlaceholder')"
          />
          <small class="hint">{{ t('randomTables.newEntriesHint') }}</small>
        </label>
        <div class="row">
          <button class="small" type="submit" :disabled="!newEntries.trim()">
            {{ t('randomTables.addEntries') }}
          </button>
        </div>
      </form>
    </fieldset>

    <div class="row">
      <button class="danger" type="button" @click="emit('remove')">
        {{ t('randomTables.delete') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.entries {
  margin: 0;
  padding: 0;
  list-style: none;
}

.entry {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 0.5rem;
  align-items: start;
}

.entry .grow {
  flex: 1 1 14rem;
  min-width: 0;
}

/* Long entries wrap instead of hiding behind the first line. */
.entry textarea {
  field-sizing: content;
}

.entry .tools {
  flex: 0 1 auto;
  margin-left: auto;
  gap: 0.4rem;
  align-items: center;
}

.range {
  flex: none;
  width: 2.75rem;
  padding-top: 0.45rem;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  text-align: right;
  color: var(--muted);
}

.weight {
  gap: 0.3rem;
}

.weight input {
  width: 4.5rem;
}

.tools select {
  width: 13rem;
  max-width: 100%;
}
</style>
