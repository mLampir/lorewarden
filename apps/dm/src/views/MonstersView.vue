<script setup lang="ts">
import {
  createMonster,
  formatChallengeRating,
  type Monster,
  monsterFromStatBlock,
  type StatBlock,
  srdMonsters,
} from '@lorewarden/core';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import MonsterAi from '../components/MonsterAi.vue';
import MonsterEditor from '../components/MonsterEditor.vue';
import StatBlockView from '../components/StatBlockView.vue';
import { useAutosave } from '../composables/useAutosave';
import { useMonsterLibrary } from '../composables/useMonsterLibrary';
import { useSettings } from '../composables/useSettings';

const { t } = useI18n();
const { adventureLanguage, termsLanguage } = useSettings();
const library = useMonsterLibrary();

/** Shown in the list, so a long SRD list does not slow the page down. */
const SRD_LIMIT = 60;

const query = ref('');
/** A copy of the library monster being edited; changes are saved shortly after typing. */
const editing = ref<Monster>();
const srdMonster = ref<StatBlock>();
const writingWithAi = ref(false);

const { failed: saveFailed, markSaved, flush } = useAutosave(editing, library.save);

const matches = (monster: { name: string; type: string }) => {
  const text = query.value.trim().toLowerCase();
  return (
    text === '' ||
    monster.name.toLowerCase().includes(text) ||
    monster.type.toLowerCase().includes(text)
  );
};
const ownMonsters = computed(() => library.monsters.value.filter(matches));
const srdMatches = computed(() => srdMonsters.filter(matches));

const describe = (monster: { size: string; type: string; cr: number }) =>
  `${t(`monsters.sizes.${monster.size}`)} ${monster.type}, CR ${formatChallengeRating(monster.cr)}`;

async function open(monster: Monster) {
  await flush();
  const copy = structuredClone(monster);
  markSaved(copy);
  editing.value = copy;
  srdMonster.value = undefined;
  writingWithAi.value = false;
}

async function openSrd(monster: StatBlock) {
  await flush();
  editing.value = undefined;
  srdMonster.value = monster;
  writingWithAi.value = false;
}

async function startAi() {
  await flush();
  editing.value = undefined;
  srdMonster.value = undefined;
  writingWithAi.value = true;
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
        <RouterLink to="/" class="hint">← {{ t('common.backToLibrary') }}</RouterLink>
        <h1>{{ t('monsters.heading') }}</h1>
        <p class="hint">{{ t('monsters.intro') }}</p>
      </div>
    </header>

    <section class="master-detail">
      <div class="stack">
        <div class="row">
          <button @click="add(createMonster(t('monsters.newName')))">{{ t('monsters.new') }}</button>
          <button @click="startAi">{{ t('monsters.ai.open') }}</button>
        </div>
        <input
          v-model="query"
          type="search"
          :placeholder="t('monsters.search')"
          :aria-label="t('monsters.search')"
        />
        <h2>{{ t('monsters.own') }}</h2>
        <ul v-if="ownMonsters.length > 0" class="list">
          <li v-for="monster in ownMonsters" :key="monster.id">
            <button
              class="entry"
              :aria-current="monster.id === editing?.id"
              @click="open(monster)"
            >
              {{ monster.name }} <span class="hint">{{ describe(monster) }}</span>
            </button>
          </li>
        </ul>
        <p v-else class="hint">{{ t('monsters.noOwn') }}</p>
        <h2>{{ t('monsters.srd') }}</h2>
        <ul class="list">
          <li v-for="monster in srdMatches.slice(0, SRD_LIMIT)" :key="monster.id">
            <button
              class="entry"
              :aria-current="monster.id === srdMonster?.id"
              @click="openSrd(monster)"
            >
              {{ monster.name }} <span class="hint">{{ describe(monster) }}</span>
            </button>
          </li>
        </ul>
        <p v-if="srdMatches.length > SRD_LIMIT" class="hint">
          {{ t('monsters.more', { count: srdMatches.length - SRD_LIMIT }) }}
        </p>
      </div>

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
      <p v-else class="muted">{{ t('monsters.none') }}</p>
    </section>
  </main>
</template>

<style scoped>
h2 {
  font-size: 1rem;
  margin: 0.5rem 0 0;
}
</style>
