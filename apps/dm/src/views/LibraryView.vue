<script setup lang="ts">
import {
  type Adventure,
  type AdventureLength,
  buildAdventurePrompt,
  copyAdventure,
  createAdventure,
  followParty,
  type IntegrityProblem,
  parseAdventure,
  partyNumbers,
} from '@lorewarden/core';
import {
  BookOpen,
  ClipboardList,
  FilePlus,
  FileUp,
  Pencil,
  Play,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  X,
} from '@lucide/vue';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import exampleJson from '../../../../examples/lantern-in-the-marsh.adventure.json?raw';
import { useMonsterLibrary } from '../composables/useMonsterLibrary';
import { useParties } from '../composables/useParties';
import { useSettings } from '../composables/useSettings';
import { extractJson } from '../lib/extract-json';
import { languageOptions } from '../lib/languages';
import { onAdventureChange, onConnected } from '../lib/server';
import {
  type AdventureSummary,
  deleteAdventure,
  getAdventure,
  listAdventures,
  saveAdventure,
} from '../storage/database';

const { t, d, locale } = useI18n();
const { adventureLanguage, termsLanguage } = useSettings();
const router = useRouter();
const { monsters: ownMonsters } = useMonsterLibrary();

const adventures = ref<AdventureSummary[]>([]);
const loaded = ref(false);

/** The three ways to a new adventure, offered together in one dialog. */
type CreateMode = 'blank' | 'ai' | 'import';
const createModes: CreateMode[] = ['blank', 'ai', 'import'];
const createMode = ref<CreateMode>('blank');
const dialog = ref<HTMLDialogElement>();

const dialogOpen = ref(false);

/** What went wrong when the server did not take a change; shown in the dialog while it is open. */
const failure = ref<'saveFailed' | 'deleteFailed'>();

function openCreate(mode: CreateMode) {
  createMode.value = mode;
  failure.value = undefined;
  dialog.value?.showModal();
  dialogOpen.value = true;
}

function closeCreate() {
  dialog.value?.close();
}

/** Runs a change on the server and shows a message instead of failing silently. */
async function attempt(kind: 'saveFailed' | 'deleteFailed', action: () => Promise<void>) {
  failure.value = undefined;
  try {
    await action();
  } catch {
    failure.value = kind;
  }
}

const title = ref('');
const { parties } = useParties();
/** A party of the game master's the new adventure is for; size and level then come from it. */
const newPartyId = ref('');
const newParty = computed(() => parties.value.find((p) => p.id === newPartyId.value));
/** Undefined while the party has no characters yet; the typed size and level then count. */
const newPartyNumbers = computed(() =>
  newParty.value && newParty.value.characters.length > 0 ? partyNumbers(newParty.value) : undefined,
);
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
  try {
    adventures.value = await listAdventures();
    loaded.value = true;
  } catch {
    // The server is not running; the banner says so and the list loads once it is back.
  }
}

onMounted(refresh);
// Adventures an AI assistant or another tab creates appear without reloading the page.
const stopChanges = onAdventureChange(() => void refresh());
const stopConnected = onConnected(() => void refresh());
onBeforeUnmount(() => {
  stopChanges();
  stopConnected();
});

function create() {
  return attempt('saveFailed', async () => {
    const created = createAdventure({
      title: title.value.trim() || t('library.untitled'),
      partySize: partySize.value,
      partyLevel: partyLevel.value,
      language: adventureLanguage.value,
      termsLanguage: termsLanguage.value,
    });
    const adventure = newParty.value ? followParty(created, newParty.value) : created;
    await saveAdventure(adventure);
    closeCreate();
    await router.push({ name: 'edit', params: { id: adventure.id } });
  });
}

/**
 * Stores an imported adventure, asking before it replaces one with the same id. Returns what was
 * stored, which is a copy with a new id when the game master keeps the existing one.
 */
async function store(adventure: Adventure): Promise<Adventure> {
  let result = adventure;
  if (await getAdventure(adventure.id)) {
    const replace = window.confirm(t('library.replaceConfirm', { title: adventure.title }));
    if (!replace)
      result = copyAdventure(adventure, t('library.copyTitle', { title: adventure.title }));
  }
  await saveAdventure(result);
  closeCreate();
  await refresh();
  return result;
}

async function importFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  const result = parseAdventure(await file.text(), ownMonsters.value);
  if (!result.ok) {
    importProblems.value = result.problems;
    return;
  }
  importProblems.value = [];
  await attempt('saveFailed', async () => {
    await store(result.adventure);
  });
}

/** Copies instructions for Claude; shows them for manual copying if the clipboard is blocked. */
async function copyPrompt() {
  prompt.value = buildAdventurePrompt(
    {
      idea: idea.value,
      partySize: ideaPartySize.value,
      partyLevel: ideaPartyLevel.value,
      length: length.value,
      language: adventureLanguage.value,
      termsLanguage: termsLanguage.value,
      ...(newParty.value ? { party: newParty.value } : {}),
    },
    ownMonsters.value,
  );
  try {
    await navigator.clipboard.writeText(prompt.value);
    copied.value = true;
  } catch {
    copied.value = false;
  }
}

async function importAnswer() {
  const result = parseAdventure(extractJson(answer.value), ownMonsters.value);
  if (!result.ok) {
    answerProblems.value = result.problems;
    return;
  }
  answerProblems.value = [];
  const adventure = newParty.value
    ? followParty(result.adventure, newParty.value)
    : result.adventure;
  await attempt('saveFailed', async () => {
    const stored = await store(adventure);
    answer.value = '';
    await router.push({ name: 'edit', params: { id: stored.id } });
  });
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
  if (!result.ok) return;
  await attempt('saveFailed', async () => {
    await store(result.adventure);
  });
}

async function remove(summary: AdventureSummary) {
  if (!window.confirm(t('library.deleteConfirm', { title: summary.title }))) return;
  await attempt('deleteFailed', async () => {
    await deleteAdventure(summary.id);
    await refresh();
  });
}
</script>

<template>
  <main class="page">
    <header class="page-header">
      <div>
        <h1>{{ t('library.heading') }}</h1>
        <p class="muted">{{ t('app.tagline') }}</p>
      </div>
      <div v-if="adventures.length > 0" class="row">
        <button @click="openCreate('import')">
          <Upload aria-hidden="true" />{{ t('library.import') }}
        </button>
        <button class="primary" @click="openCreate('blank')">
          <Plus aria-hidden="true" />{{ t('library.new') }}
        </button>
      </div>
    </header>

    <p v-if="failure && !dialogOpen" class="error" role="alert">{{ t(`library.${failure}`) }}</p>

    <section v-if="loaded && adventures.length === 0" class="card empty">
      <span class="empty-icon" aria-hidden="true"><BookOpen :size="28" /></span>
      <h2>{{ t('library.emptyHeading') }}</h2>
      <p class="muted">{{ t('library.empty') }}</p>
      <div class="starts">
        <button class="start" @click="openCreate('blank')">
          <FilePlus aria-hidden="true" />
          <strong>{{ t('library.modes.blank') }}</strong>
          <span class="hint">{{ t('library.modeHints.blank') }}</span>
        </button>
        <button class="start" @click="openCreate('ai')">
          <Sparkles aria-hidden="true" />
          <strong>{{ t('library.modes.ai') }}</strong>
          <span class="hint">{{ t('library.modeHints.ai') }}</span>
        </button>
        <button class="start" @click="loadExample">
          <BookOpen aria-hidden="true" />
          <strong>{{ t('library.modes.example') }}</strong>
          <span class="hint">{{ t('library.modeHints.example') }}</span>
        </button>
      </div>
      <button class="ghost" @click="openCreate('import')">
        <Upload aria-hidden="true" />{{ t('library.modes.import') }}
      </button>
    </section>

    <ul v-else class="list adventures">
      <li v-for="adventure in adventures" :key="adventure.id" class="card adventure">
        <div class="adventure-text">
          <h2>
            <RouterLink :to="{ name: 'edit', params: { id: adventure.id } }">
              {{ adventure.title }}
            </RouterLink>
          </h2>
          <p class="hint">
            {{ t('library.sceneCount', adventure.sceneCount) }} ·
            {{ t('library.updated', { date: d(new Date(adventure.updatedAt), 'short') }) }}
          </p>
        </div>
        <div class="row actions">
          <RouterLink :to="{ name: 'play', params: { id: adventure.id } }" custom>
            <template #default="{ navigate }">
              <button class="primary" @click="navigate">
                <Play aria-hidden="true" />{{ t('library.play') }}
              </button>
            </template>
          </RouterLink>
          <RouterLink :to="{ name: 'prep', params: { id: adventure.id } }" custom>
            <template #default="{ navigate }">
              <button @click="navigate">
                <ClipboardList aria-hidden="true" />{{ t('library.prepare') }}
              </button>
            </template>
          </RouterLink>
          <RouterLink :to="{ name: 'edit', params: { id: adventure.id } }" custom>
            <template #default="{ navigate }">
              <button @click="navigate"><Pencil aria-hidden="true" />{{ t('library.edit') }}</button>
            </template>
          </RouterLink>
          <button
            class="ghost icon-only delete"
            :title="t('common.delete')"
            :aria-label="`${t('common.delete')}: ${adventure.title}`"
            @click="remove(adventure)"
          >
            <Trash2 aria-hidden="true" />
          </button>
        </div>
      </li>
    </ul>

    <p class="hint local-note">{{ t('library.localNote') }}</p>

    <dialog ref="dialog" class="modal" :aria-label="t('library.new')" @close="dialogOpen = false">
      <header class="modal-header">
        <h2>{{ t('library.new') }}</h2>
        <button class="ghost icon-only" :aria-label="t('common.close')" @click="closeCreate">
          <X aria-hidden="true" />
        </button>
      </header>
      <div class="tabs" role="tablist">
        <button
          v-for="mode in createModes"
          :key="mode"
          role="tab"
          :aria-selected="createMode === mode"
          @click="createMode = mode"
        >
          {{ t(`library.modes.${mode}`) }}
        </button>
      </div>
      <p v-if="failure && dialogOpen" class="error" role="alert">{{ t(`library.${failure}`) }}</p>

      <form v-if="createMode === 'blank'" class="stack" @submit.prevent="create">
        <label class="field">
          <span>{{ t('adventure.title') }}</span>
          <input v-model="title" :placeholder="t('library.untitled')" autofocus />
        </label>
        <div class="row">
          <label v-if="parties.length > 0" class="field">
            <span>{{ t('adventure.party') }}</span>
            <select v-model="newPartyId">
              <option value="">{{ t('adventure.noParty') }}</option>
              <option v-for="p in parties" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </label>
          <label class="field">
            <span>{{ t('adventure.partySize') }}</span>
            <input
              v-if="newPartyNumbers"
              :value="newPartyNumbers.size"
              type="number"
              disabled
            />
            <input v-else v-model.number="partySize" type="number" min="1" max="12" />
          </label>
          <label class="field">
            <span>{{ t('adventure.partyLevel') }}</span>
            <input
              v-if="newPartyNumbers"
              :value="newPartyNumbers.level"
              type="number"
              disabled
            />
            <input v-else v-model.number="partyLevel" type="number" min="1" max="20" />
          </label>
        </div>
        <div class="row end">
          <button class="primary" type="submit">
            <Plus aria-hidden="true" />{{ t('library.create') }}
          </button>
        </div>
      </form>

      <div v-else-if="createMode === 'import'" class="stack">
        <p class="hint">{{ t('library.importHint') }}</p>
        <input
          ref="fileInput"
          class="sr-only"
          type="file"
          accept=".json,application/json"
          @change="importFile"
        />
        <button @click="fileInput?.click()">
          <FileUp aria-hidden="true" />{{ t('library.chooseFile') }}
        </button>
        <div v-if="importProblems.length > 0" class="error" role="alert">
          <p>{{ t('library.importFailed') }}</p>
          <ul>
            <li v-for="(problem, i) in importProblems.slice(0, 10)" :key="i">
              <code v-if="problem.path">{{ problem.path }}</code> {{ problem.message }}
            </li>
          </ul>
        </div>
        <button class="ghost" @click="loadExample">
          <BookOpen aria-hidden="true" />{{ t('library.loadExample') }}
        </button>
      </div>

      <div v-else class="stack">
        <p class="hint">{{ t('claude.intro') }}</p>
        <label class="field">
          <span>{{ t('claude.idea') }}</span>
          <textarea v-model="idea" rows="3" :placeholder="t('claude.ideaHint')" />
        </label>
        <div class="row">
          <label v-if="parties.length > 0" class="field">
            <span>{{ t('adventure.party') }}</span>
            <select v-model="newPartyId">
              <option value="">{{ t('adventure.noParty') }}</option>
              <option v-for="p in parties" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </label>
          <label class="field">
            <span>{{ t('adventure.partySize') }}</span>
            <input
              v-if="newPartyNumbers"
              :value="newPartyNumbers.size"
              type="number"
              disabled
            />
            <input v-else v-model.number="ideaPartySize" type="number" min="1" max="12" />
          </label>
          <label class="field">
            <span>{{ t('adventure.partyLevel') }}</span>
            <input
              v-if="newPartyNumbers"
              :value="newPartyNumbers.level"
              type="number"
              disabled
            />
            <input v-else v-model.number="ideaPartyLevel" type="number" min="1" max="20" />
          </label>
          <label class="field">
            <span>{{ t('claude.length') }}</span>
            <select v-model="length">
              <option value="one-shot">{{ t('claude.lengths.oneShot') }}</option>
              <option value="two-evenings">{{ t('claude.lengths.twoEvenings') }}</option>
            </select>
          </label>
        </div>
        <p class="hint">
          {{ languageNote }}
          <RouterLink :to="{ name: 'settings' }" @click="closeCreate">
            {{ t('claude.changeInSettings') }}
          </RouterLink>
        </p>
        <ol class="steps">
          <li>
            <div class="stack">
              <span>{{ t('claude.step1') }}</span>
              <div>
                <button class="primary" @click="copyPrompt">
                  <Sparkles aria-hidden="true" />{{ t('claude.copyPrompt') }}
                </button>
              </div>
              <p v-if="copied" class="hint" role="status">{{ t('claude.copied') }}</p>
              <label v-else-if="prompt" class="field">
                <span>{{ t('claude.copyManually') }}</span>
                <textarea
                  :value="prompt"
                  rows="6"
                  readonly
                  @focus="($event.target as HTMLTextAreaElement).select()"
                />
              </label>
            </div>
          </li>
          <li>{{ t('claude.step2') }}</li>
          <li>
            <div class="stack">
              <span>{{ t('claude.step3') }}</span>
              <label class="field">
                <span class="sr-only">{{ t('claude.answer') }}</span>
                <textarea v-model="answer" rows="4" :placeholder="t('claude.answerHint')" />
              </label>
              <div>
                <button :disabled="answer.trim() === ''" @click="importAnswer">
                  {{ t('claude.importAnswer') }}
                </button>
              </div>
            </div>
          </li>
        </ol>
        <div v-if="answerProblems.length > 0" class="error stack" role="alert">
          <p>{{ t('claude.importFailed') }}</p>
          <ul>
            <li v-for="(problem, i) in answerProblems.slice(0, 10)" :key="i">
              <code v-if="problem.path">{{ problem.path }}</code> {{ problem.message }}
            </li>
          </ul>
          <div>
            <button class="small" @click="copyProblems">{{ t('claude.copyProblems') }}</button>
          </div>
        </div>
      </div>
    </dialog>
  </main>
</template>

<style scoped>
.adventures {
  display: grid;
  gap: 0.75rem;
}

.adventure {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem 1.5rem;
  padding: 1.1rem 1.25rem;
}

.adventure h2 {
  margin: 0 0 0.15rem;
  font-size: 1.15rem;
}

.adventure h2 a {
  color: inherit;
  text-decoration: none;
}

.adventure h2 a:hover {
  color: var(--accent);
}

.delete:hover:not(:disabled) {
  color: var(--danger);
}

.local-note {
  margin-top: 1.5rem;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 2.5rem 1.25rem;
  text-align: center;
}

.empty h2,
.empty p {
  margin: 0;
}

.empty-icon {
  display: grid;
  place-items: center;
  width: 3.5rem;
  height: 3.5rem;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent);
}

.starts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: 0.75rem;
  width: 100%;
  max-width: 44rem;
  margin: 1rem 0 0.5rem;
}

.start {
  flex-direction: column;
  justify-content: flex-start;
  gap: 0.35rem;
  padding: 1.1rem 1rem;
  border-radius: var(--radius);
  text-align: center;
}

.start svg {
  width: 1.5rem;
  height: 1.5rem;
  color: var(--accent);
}

.start .hint {
  font-weight: 400;
}

.steps {
  margin: 0;
  padding-left: 1.3rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.field input[type='number'] {
  width: 6rem;
}

.end {
  justify-content: flex-end;
}
</style>
