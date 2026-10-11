<script setup lang="ts">
import {
  type Adventure,
  type AdventureLength,
  buildAdventurePrompt,
  copyAdventure,
  createAdventure,
  type IntegrityProblem,
  parseAdventure,
} from '@lorewarden/core';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import exampleJson from '../../../../examples/lantern-in-the-marsh.adventure.json?raw';
import { useSettings } from '../composables/useSettings';
import { extractJson } from '../lib/extract-json';
import { languageOptions } from '../lib/languages';
import {
  type AdventureSummary,
  deleteAdventure,
  getAdventure,
  listAdventures,
  onStorageChange,
  saveAdventure,
} from '../storage/database';

const { t, d, locale } = useI18n();
const { adventureLanguage, termsLanguage } = useSettings();
const router = useRouter();

const adventures = ref<AdventureSummary[]>([]);
const title = ref('');
const partySize = ref(4);
const partyLevel = ref(1);
const importProblems = ref<IntegrityProblem[]>([]);
const fileInput = ref<HTMLInputElement>();

const idea = ref('');
const ideaPartySize = ref(4);
const ideaPartyLevel = ref(1);
const length = ref<AdventureLength>('one-shot');
/** What the settings say about new adventures, shown so the form itself can stay short. */
const languageNote = computed(() => {
  const name = languageOptions(locale.value, adventureLanguage.value).find(
    (option) => option.tag === adventureLanguage.value,
  )?.name;
  return t(termsLanguage.value ? 'claude.languageNoteTerms' : 'claude.languageNote', {
    language: name ?? adventureLanguage.value,
  });
});
const prompt = ref('');
const copied = ref(false);
const answer = ref('');
const answerProblems = ref<IntegrityProblem[]>([]);

async function refresh() {
  adventures.value = await listAdventures();
}

onMounted(refresh);
// Adventures the AI assistant creates or changes show up right away.
onBeforeUnmount(onStorageChange((change) => change.kind !== 'session' && void refresh()));

async function create() {
  const adventure = createAdventure({
    title: title.value.trim() || t('library.untitled'),
    partySize: partySize.value,
    partyLevel: partyLevel.value,
    language: adventureLanguage.value,
    termsLanguage: termsLanguage.value,
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

/** Copies instructions for Claude; shows them for manual copying if the clipboard is blocked. */
async function copyPrompt() {
  prompt.value = buildAdventurePrompt({
    idea: idea.value,
    partySize: ideaPartySize.value,
    partyLevel: ideaPartyLevel.value,
    length: length.value,
    language: adventureLanguage.value,
    termsLanguage: termsLanguage.value,
  });
  try {
    await navigator.clipboard.writeText(prompt.value);
    copied.value = true;
  } catch {
    copied.value = false;
  }
}

async function importAnswer() {
  const result = parseAdventure(extractJson(answer.value));
  if (!result.ok) {
    answerProblems.value = result.problems;
    return;
  }
  answerProblems.value = [];
  answer.value = '';
  await store(result.adventure);
  await router.push({ name: 'edit', params: { id: result.adventure.id } });
}

/** Copies the import errors so they can be pasted back to Claude for a fixed file. */
async function copyProblems() {
  const lines = answerProblems.value.map((p) => (p.path ? `${p.path}: ${p.message}` : p.message));
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
  } catch {
    // Nothing to do: the errors stay visible for manual copying.
  }
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

        <div class="card stack">
          <h2>{{ t('claude.heading') }}</h2>
          <p class="hint">{{ t('claude.intro') }}</p>
          <label class="field">
            <span>{{ t('claude.idea') }}</span>
            <textarea v-model="idea" rows="3" :placeholder="t('claude.ideaHint')" />
          </label>
          <div class="row">
            <label class="field">
              <span>{{ t('adventure.partySize') }}</span>
              <input v-model.number="ideaPartySize" type="number" min="1" max="12" />
            </label>
            <label class="field">
              <span>{{ t('adventure.partyLevel') }}</span>
              <input v-model.number="ideaPartyLevel" type="number" min="1" max="20" />
            </label>
          </div>
          <label class="field">
            <span>{{ t('claude.length') }}</span>
            <select v-model="length">
              <option value="one-shot">{{ t('claude.lengths.oneShot') }}</option>
              <option value="two-evenings">{{ t('claude.lengths.twoEvenings') }}</option>
            </select>
          </label>
          <p class="hint">
            {{ languageNote }}
            <RouterLink :to="{ name: 'settings' }">{{ t('claude.changeInSettings') }}</RouterLink>
          </p>
          <button class="primary" @click="copyPrompt">{{ t('claude.copyPrompt') }}</button>
          <p v-if="copied" class="hint" role="status">{{ t('claude.copied') }}</p>
          <label v-else-if="prompt" class="field">
            <span>{{ t('claude.copyManually') }}</span>
            <textarea :value="prompt" rows="6" readonly @focus="($event.target as HTMLTextAreaElement).select()" />
          </label>
          <ol class="hint steps">
            <li>{{ t('claude.step1') }}</li>
            <li>{{ t('claude.step2') }}</li>
            <li>{{ t('claude.step3') }}</li>
          </ol>
          <label class="field">
            <span>{{ t('claude.answer') }}</span>
            <textarea v-model="answer" rows="4" :placeholder="t('claude.answerHint')" />
          </label>
          <button :disabled="answer.trim() === ''" @click="importAnswer">
            {{ t('claude.importAnswer') }}
          </button>
          <div v-if="answerProblems.length > 0" class="error stack" role="alert">
            <p>{{ t('claude.importFailed') }}</p>
            <ul>
              <li v-for="(problem, i) in answerProblems.slice(0, 10)" :key="i">
                <code v-if="problem.path">{{ problem.path }}</code> {{ problem.message }}
              </li>
            </ul>
            <button class="small" @click="copyProblems">{{ t('claude.copyProblems') }}</button>
          </div>
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

.steps {
  margin: 0;
  padding-left: 1.2rem;
}

.field input[type='number'] {
  width: 6rem;
}
</style>
