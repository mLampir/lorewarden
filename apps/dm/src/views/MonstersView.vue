<script setup lang="ts">
import {
  createMonster,
  formatChallengeRating,
  type Monster,
  monsterFromStatBlock,
  type StatBlock,
  srdMonsters,
} from '@lorewarden/core';
import { Plus, Sparkles } from '@lucide/vue';
import { computed, nextTick, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import MonsterAi from '../components/MonsterAi.vue';
import MonsterEditor from '../components/MonsterEditor.vue';
import StatBlockView from '../components/StatBlockView.vue';
import { useAutosave } from '../composables/useAutosave';
import { useLeaveGuard } from '../composables/useLeaveGuard';
import { useMonsterLibrary } from '../composables/useMonsterLibrary';
import { useSettings } from '../composables/useSettings';

const { t } = useI18n();
const { adventureLanguage, termsLanguage, term } = useSettings();
const library = useMonsterLibrary();

const query = ref('');
/** Challenge rating ranges to narrow the list, as [lowest, highest]. */
const crRanges: Record<string, [number, number]> = {
  all: [0, 30],
  low: [0, 1],
  mid: [2, 4],
  high: [5, 10],
  epic: [11, 30],
};
const crRange = ref('all');
const typeFilter = ref('');
const detail = ref<HTMLElement>();
/** A copy of the library monster being edited; changes are saved shortly after typing. */
const editing = ref<Monster>();
const srdMonster = ref<StatBlock>();
const writingWithAi = ref(false);

const {
  failed: saveFailed,
  pending: savePending,
  markSaved,
  flush,
} = useAutosave(editing, library.save);
useLeaveGuard(savePending);

const matches = (monster: { name: string; type: string; cr: number }) => {
  const text = query.value.trim().toLowerCase();
  const [lowest, highest] = crRanges[crRange.value] ?? [0, 30];
  return (
    (text === '' ||
      monster.name.toLowerCase().includes(text) ||
      monster.type.toLowerCase().includes(text)) &&
    monster.cr >= lowest &&
    monster.cr <= highest &&
    (typeFilter.value === '' || monster.type.toLowerCase() === typeFilter.value)
  );
};
/** Every creature type in the list, for the type filter. */
const types = computed(() =>
  [...new Set([...srdMonsters, ...library.monsters.value].map((m) => m.type.toLowerCase()))]
    .filter((type) => type !== '')
    .sort(),
);
const ownMonsters = computed(() => library.monsters.value.filter(matches));
const srdMatches = computed(() => srdMonsters.filter(matches));

const describe = (monster: { size: string; type: string }) =>
  `${t(`monsters.sizes.${monster.size}`)} ${monster.type}`;

/** Brings the chosen monster into view, e.g. below the list on a phone or after scrolling down. */
async function showDetail() {
  await nextTick();
  const top = detail.value?.getBoundingClientRect().top;
  if (top !== undefined && (top < 0 || top > window.innerHeight * 0.6))
    detail.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function open(monster: Monster) {
  await flush();
  const copy = structuredClone(monster);
  markSaved(copy);
  editing.value = copy;
  srdMonster.value = undefined;
  writingWithAi.value = false;
  await showDetail();
}

async function openSrd(monster: StatBlock) {
  await flush();
  editing.value = undefined;
  srdMonster.value = monster;
  writingWithAi.value = false;
  await showDetail();
}

async function startAi() {
  await flush();
  editing.value = undefined;
  srdMonster.value = undefined;
  writingWithAi.value = true;
  await showDetail();
}

/** Saves a monster that is new to the library and opens it. */
async function add(monster: Monster) {
  await library.save(monster);
  query.value = '';
  await open(monster);
}

async function remove() {
  const monster = editing.value;
  if (!monster || !window.confirm(t('monsters.deleteConfirm', { name: monster.name }))) return;
  markSaved(undefined);
  editing.value = undefined;
  await library.remove(monster.id);
}
</script>

<template>
  <main class="page">
    <header class="page-header">
      <div>
        <h1>{{ t('monsters.heading') }}</h1>
        <p class="muted">{{ t('monsters.intro') }}</p>
      </div>
      <div class="row">
        <button @click="startAi"><Sparkles aria-hidden="true" />{{ t('monsters.ai.open') }}</button>
        <button class="primary" @click="add(createMonster(t('monsters.newName')))">
          <Plus aria-hidden="true" />{{ t('monsters.new') }}
        </button>
      </div>
    </header>

    <section class="master-detail">
      <div class="card browser">
        <div class="filters">
          <input
            v-model="query"
            type="search"
            :placeholder="t('monsters.search')"
            :aria-label="t('monsters.search')"
          />
          <div class="row">
            <select v-model="crRange" :aria-label="t('monsters.crFilter')">
              <option v-for="(_, key) in crRanges" :key="key" :value="key">
                {{ t(`monsters.crRanges.${key}`) }}
              </option>
            </select>
            <select v-model="typeFilter" :aria-label="t('monsters.typeFilter')">
              <option value="">{{ t('monsters.allTypes') }}</option>
              <option v-for="type in types" :key="type" :value="type">{{ type }}</option>
            </select>
          </div>
        </div>
        <div class="scroll">
          <h2>{{ t('monsters.own') }}</h2>
          <ul v-if="ownMonsters.length > 0" class="list">
            <li v-for="monster in ownMonsters" :key="monster.id">
              <button
                class="entry"
                :aria-current="monster.id === editing?.id"
                @click="open(monster)"
              >
                <span class="name">{{ monster.name }}</span>
                <span class="cr">{{ term('statBlock.cr') }} {{ formatChallengeRating(monster.cr) }}</span>
                <span class="hint">{{ describe(monster) }}</span>
              </button>
            </li>
          </ul>
          <p v-else class="hint">{{ t('monsters.noOwn') }}</p>
          <h2>{{ t('monsters.srd') }}</h2>
          <ul class="list">
            <li v-for="monster in srdMatches" :key="monster.id">
              <button
                class="entry"
                :aria-current="monster.id === srdMonster?.id"
                @click="openSrd(monster)"
              >
                <span class="name">{{ monster.name }}</span>
                <span class="cr">{{ term('statBlock.cr') }} {{ formatChallengeRating(monster.cr) }}</span>
                <span class="hint">{{ describe(monster) }}</span>
              </button>
            </li>
          </ul>
          <p v-if="srdMatches.length === 0" class="hint">{{ t('monsters.noMatch') }}</p>
        </div>
      </div>

      <div ref="detail" class="detail">
        <MonsterAi
          v-if="writingWithAi"
          :language="adventureLanguage"
          :terms-language="termsLanguage"
          @created="add"
        />
        <MonsterEditor v-else-if="editing" :key="editing.id" :monster="editing">
          <p v-if="saveFailed" class="error" role="alert">{{ t('common.saveFailed') }}</p>
          <div class="row">
            <button class="danger" type="button" @click="remove">{{ t('monsters.delete') }}</button>
          </div>
        </MonsterEditor>
        <div v-else-if="srdMonster" class="stack">
          <StatBlockView :stat-block="srdMonster" />
          <div class="row">
            <button @click="add(monsterFromStatBlock(srdMonster))">{{ t('monsters.copy') }}</button>
          </div>
          <p class="hint">{{ t('monsters.copyHint') }}</p>
        </div>
        <div v-else class="card placeholder">
          <p class="muted">{{ t('monsters.none') }}</p>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
@media (min-width: 721px) {
  .master-detail {
    grid-template-columns: minmax(16rem, 21rem) 1fr;
  }
}

/* The list keeps its place while the stat block next to it scrolls. */
.browser {
  position: sticky;
  top: 4.25rem;
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 5.5rem);
  padding: 0;
  overflow: hidden;
}

.filters {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  border-bottom: 1px solid var(--border);
}

.filters select {
  flex: 1;
}

.scroll {
  overflow-y: auto;
  padding: 0.25rem 0.5rem 0.75rem;
}

h2 {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
  margin: 0.75rem 0.65rem 0.25rem;
}

.scroll > .hint {
  padding: 0 0.65rem;
}

.list button.entry {
  display: grid;
  grid-template-columns: 1fr auto;
  column-gap: 0.5rem;
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cr {
  grid-row: span 2;
  align-self: center;
  font-size: 0.75rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--muted);
  white-space: nowrap;
}

.entry .hint {
  font-size: 0.8rem;
  font-weight: 400;
}

.detail {
  min-width: 0;
  scroll-margin-top: 4.25rem;
}

.placeholder {
  display: grid;
  place-items: center;
  min-height: 12rem;
}

@media (max-width: 720px) {
  .browser {
    position: static;
    max-height: 60vh;
  }
}
</style>
