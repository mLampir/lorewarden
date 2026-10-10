<script setup lang="ts">
import {
  type Adventure,
  copyAdventure,
  createAdventure,
  type IntegrityProblem,
  parseAdventure,
} from '@lorewarden/core';
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import exampleJson from '../../../../examples/lantern-in-the-marsh.adventure.json?raw';
import {
  type AdventureSummary,
  deleteAdventure,
  getAdventure,
  listAdventures,
  saveAdventure,
} from '../storage/database';

const { t, d } = useI18n();
const router = useRouter();

const adventures = ref<AdventureSummary[]>([]);
const title = ref('');
const partySize = ref(4);
const partyLevel = ref(1);
const importProblems = ref<IntegrityProblem[]>([]);
const fileInput = ref<HTMLInputElement>();

async function refresh() {
  adventures.value = await listAdventures();
}

onMounted(refresh);

async function create() {
  const adventure = createAdventure({
    title: title.value.trim() || t('library.untitled'),
    partySize: partySize.value,
    partyLevel: partyLevel.value,
  });
  await saveAdventure(adventure);
  await router.push({ name: 'edit', params: { id: adventure.id } });
}

/** Stores an imported adventure, asking before it replaces one with the same id. */
async function store(adventure: Adventure) {
  let result = adventure;
  if (await getAdventure(adventure.id)) {
    const replace = window.confirm(t('library.replaceConfirm', { title: adventure.title }));
    if (!replace)
      result = copyAdventure(adventure, t('library.copyTitle', { title: adventure.title }));
  }
  await saveAdventure(result);
  await refresh();
}

async function importFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  const result = parseAdventure(await file.text());
  if (!result.ok) {
    importProblems.value = result.problems;
    return;
  }
  importProblems.value = [];
  await store(result.adventure);
}

async function loadExample() {
  const result = parseAdventure(exampleJson);
  if (result.ok) await store(result.adventure);
}

async function remove(summary: AdventureSummary) {
  if (!window.confirm(t('library.deleteConfirm', { title: summary.title }))) return;
  await deleteAdventure(summary.id);
  await refresh();
}
</script>

<template>
  <main class="page">
    <section class="intro">
      <h1>{{ t('library.heading') }}</h1>
      <p class="muted">{{ t('app.tagline') }}</p>
      <p class="hint">{{ t('library.localNote') }}</p>
    </section>

    <div class="library">
      <section class="stack">
        <h2>{{ t('library.yourAdventures') }}</h2>
        <p v-if="adventures.length === 0" class="muted">{{ t('library.empty') }}</p>
        <ul class="list stack">
          <li v-for="adventure in adventures" :key="adventure.id" class="card adventure">
            <div>
              <h3>{{ adventure.title }}</h3>
              <p class="hint">
                {{ t('library.sceneCount', adventure.sceneCount) }} ·
                {{ t('library.updated', { date: d(new Date(adventure.updatedAt), 'short') }) }}
              </p>
            </div>
            <div class="row">
              <RouterLink :to="{ name: 'play', params: { id: adventure.id } }" custom>
                <template #default="{ navigate }">
                  <button class="primary" @click="navigate">{{ t('library.play') }}</button>
                </template>
              </RouterLink>
              <RouterLink :to="{ name: 'edit', params: { id: adventure.id } }" custom>
                <template #default="{ navigate }">
                  <button @click="navigate">{{ t('library.edit') }}</button>
                </template>
              </RouterLink>
              <button class="danger" @click="remove(adventure)">{{ t('common.delete') }}</button>
            </div>
          </li>
        </ul>
      </section>

      <aside class="stack">
        <form class="card stack" @submit.prevent="create">
          <h2>{{ t('library.new') }}</h2>
          <label class="field">
            <span>{{ t('adventure.title') }}</span>
            <input v-model="title" :placeholder="t('library.untitled')" />
          </label>
          <div class="row">
            <label class="field">
              <span>{{ t('adventure.partySize') }}</span>
              <input v-model.number="partySize" type="number" min="1" max="12" />
            </label>
            <label class="field">
              <span>{{ t('adventure.partyLevel') }}</span>
              <input v-model.number="partyLevel" type="number" min="1" max="20" />
            </label>
          </div>
          <button class="primary" type="submit">{{ t('library.create') }}</button>
        </form>

        <div class="card stack">
          <h2>{{ t('library.import') }}</h2>
          <p class="hint">{{ t('library.importHint') }}</p>
          <input
            ref="fileInput"
            class="sr-only"
            type="file"
            accept=".json,application/json"
            @change="importFile"
          />
          <button @click="fileInput?.click()">{{ t('library.chooseFile') }}</button>
          <div v-if="importProblems.length > 0" class="error" role="alert">
            <p>{{ t('library.importFailed') }}</p>
            <ul>
              <li v-for="(problem, i) in importProblems.slice(0, 10)" :key="i">
                <code v-if="problem.path">{{ problem.path }}</code> {{ problem.message }}
              </li>
            </ul>
          </div>
          <button @click="loadExample">{{ t('library.loadExample') }}</button>
        </div>
      </aside>
    </div>
  </main>
</template>

<style scoped>
.intro {
  margin-bottom: 1.5rem;
}

.library {
  display: grid;
  grid-template-columns: 1fr minmax(16rem, 22rem);
  gap: 1.5rem;
  align-items: start;
}

@media (max-width: 760px) {
  .library {
    grid-template-columns: 1fr;
  }
}

.adventure {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
}

.adventure h3 {
  margin: 0;
}

.field input[type='number'] {
  width: 6rem;
}
</style>
