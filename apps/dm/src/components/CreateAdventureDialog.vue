<script setup lang="ts">
import {
  type Adventure,
  type AdventureLength,
  buildAdventurePrompt,
  copyAdventure,
  createAdventure,
  followParty,
  type IntegrityProblem,
  type Party,
  parseAdventure,
  parsePartyLibrary,
  partyNumbers,
} from '@lorewarden/core';
import { BookOpen, FileUp, Plus, X } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import exampleJson from '../../../../examples/lantern-in-the-marsh.adventure.json?raw';
import examplePartyJson from '../../../../examples/lantern-in-the-marsh.parties.json?raw';
import { useMonsterLibrary } from '../composables/useMonsterLibrary';
import { useParties } from '../composables/useParties';
import { useSettings } from '../composables/useSettings';
import type { ClaudeTask } from '../lib/claude';
import { languageOptions } from '../lib/languages';
import { getAdventure, saveAdventure } from '../storage/database';
import AiExchange from './AiExchange.vue';
import AiHandoff from './AiHandoff.vue';

/**
 * The three ways to a new adventure, offered together in one dialog: a blank one, one written by
 * an AI, or an imported file. Emits stored after an adventure was saved, so the list can reload.
 */
const emit = defineEmits<{ stored: [] }>();
const { t, locale } = useI18n();
const { adventureLanguage, termsLanguage } = useSettings();
const router = useRouter();
const { monsters: ownMonsters } = useMonsterLibrary();

export type CreateMode = 'blank' | 'ai' | 'import';
const modes: CreateMode[] = ['blank', 'ai', 'import'];
const mode = ref<CreateMode>('blank');
const dialog = ref<HTMLDialogElement>();
/** Set when the server did not take the new adventure. */
const failed = ref(false);

function open(start: CreateMode) {
  mode.value = start;
  failed.value = false;
  dialog.value?.showModal();
}

function close() {
  dialog.value?.close();
}

/** Saves on the server and shows a message instead of failing silently. */
async function attempt(action: () => Promise<void>) {
  failed.value = false;
  try {
    await action();
  } catch {
    failed.value = true;
  }
}

const title = ref('');
const { parties, save: saveParty, refresh: refreshParties } = useParties();
/** A party of the game master's the new adventure is for; size and level then come from it. */
const partyId = ref('');
const party = computed(() => parties.value.find((p) => p.id === partyId.value));
/** Undefined while the party has no characters yet; the typed size and level then count. */
const partyFigures = computed(() =>
  party.value && party.value.characters.length > 0 ? partyNumbers(party.value) : undefined,
);
const partySize = ref(4);
const partyLevel = ref(1);
const importProblems = ref<IntegrityProblem[]>([]);
const fileInput = ref<HTMLInputElement>();

const idea = ref('');
const ideaPartySize = ref(4);
const ideaPartyLevel = ref(1);
const length = ref<AdventureLength>('one-shot');

/** The new adventure as a task for Claude; a party brings its own size and level. */
const task = computed<ClaudeTask>(() => ({
  task: 'new_adventure',
  idea: idea.value,
  party: party.value?.id,
  partySize: partyFigures.value ? undefined : String(ideaPartySize.value),
  partyLevel: partyFigures.value ? undefined : String(ideaPartyLevel.value),
  length: length.value,
  language: adventureLanguage.value,
  rulesTerms: termsLanguage.value ?? 'same',
}));
/** What the settings say about new adventures, shown so the form itself can stay short. */
const languageNote = computed(() => {
  const name = languageOptions(locale.value, adventureLanguage.value).find(
    (option) => option.tag === adventureLanguage.value,
  )?.name;
  return t(termsLanguage.value ? 'claude.languageNoteTerms' : 'claude.languageNote', {
    language: name ?? adventureLanguage.value,
  });
});

function create() {
  return attempt(async () => {
    const created = createAdventure({
      title: title.value.trim() || t('library.untitled'),
      partySize: partySize.value,
      partyLevel: partyLevel.value,
      language: adventureLanguage.value,
      termsLanguage: termsLanguage.value,
    });
    const adventure = party.value ? followParty(created, party.value) : created;
    await saveAdventure(adventure);
    close();
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
  close();
  emit('stored');
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
  await attempt(async () => {
    await store(result.adventure);
  });
}

const buildPrompt = () =>
  buildAdventurePrompt(
    {
      idea: idea.value,
      partySize: ideaPartySize.value,
      partyLevel: ideaPartyLevel.value,
      length: length.value,
      language: adventureLanguage.value,
      termsLanguage: termsLanguage.value,
      ...(party.value ? { party: party.value } : {}),
    },
    ownMonsters.value,
  );

function parse(json: string) {
  const result = parseAdventure(json, ownMonsters.value);
  return result.ok ? { ok: true as const, value: result.adventure } : result;
}

/** Stores the adventure the AI wrote and opens it; keeps the answer when saving fails. */
async function take(written: Adventure) {
  const adventure = party.value ? followParty(written, party.value) : written;
  let stored: Adventure | undefined;
  await attempt(async () => {
    stored = await store(adventure);
  });
  if (!stored) return false;
  await router.push({ name: 'edit', params: { id: stored.id } });
  return undefined;
}

/**
 * Loads the example adventure, played with the example party so it can start right away.
 * Throws when it cannot be saved.
 */
async function loadExample() {
  const result = parseAdventure(exampleJson);
  if (!result.ok) return;
  const group = await exampleParty();
  await store(group ? followParty(result.adventure, group) : result.adventure);
}

/**
 * The example party: the one saved before, with the game master's changes, or else a new one
 * from the example file.
 */
async function exampleParty(): Promise<Party | undefined> {
  const example = parsePartyLibrary(examplePartyJson).parties[0];
  if (!example) return undefined;
  await refreshParties();
  const saved = parties.value.find((p) => p.id === example.id);
  if (saved) return saved;
  await saveParty(example);
  return example;
}

defineExpose({ open, loadExample });
</script>

<template>
  <dialog ref="dialog" class="modal" :aria-label="t('library.new')">
    <header class="modal-header">
      <h2>{{ t('library.new') }}</h2>
      <button
        class="ghost icon-only"
        :title="t('common.close')"
        :aria-label="t('common.close')"
        @click="close"
      >
        <X aria-hidden="true" />
      </button>
    </header>
    <div class="tabs" role="tablist">
      <button
        v-for="name in modes"
        :id="`create-tab-${name}`"
        :key="name"
        role="tab"
        :aria-selected="mode === name"
        aria-controls="create-panel"
        @click="mode = name"
      >
        {{ t(`library.modes.${name}`) }}
      </button>
    </div>
    <p v-if="failed" class="error" role="alert">{{ t('library.saveFailed') }}</p>

    <div id="create-panel" role="tabpanel" :aria-labelledby="`create-tab-${mode}`">
      <form v-if="mode === 'blank'" class="stack" @submit.prevent="create">
        <label class="field">
          <span>{{ t('adventure.title') }}</span>
          <input v-model="title" :placeholder="t('library.untitled')" autofocus />
        </label>
        <div class="row">
          <label v-if="parties.length > 0" class="field">
            <span>{{ t('adventure.party') }}</span>
            <select v-model="partyId">
              <option value="">{{ t('adventure.noParty') }}</option>
              <option v-for="p in parties" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </label>
          <label class="field">
            <span>{{ t('adventure.partySize') }}</span>
            <input v-if="partyFigures" :value="partyFigures.size" type="number" disabled />
            <input v-else v-model.number="partySize" type="number" min="1" max="12" />
          </label>
          <label class="field">
            <span>{{ t('adventure.partyLevel') }}</span>
            <input v-if="partyFigures" :value="partyFigures.level" type="number" disabled />
            <input v-else v-model.number="partyLevel" type="number" min="1" max="20" />
          </label>
        </div>
        <div class="row end">
          <button class="primary" type="submit">
            <Plus aria-hidden="true" />{{ t('library.create') }}
          </button>
        </div>
      </form>

      <div v-else-if="mode === 'import'" class="stack">
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
        <button class="ghost" @click="attempt(loadExample)">
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
            <select v-model="partyId">
              <option value="">{{ t('adventure.noParty') }}</option>
              <option v-for="p in parties" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </label>
          <label class="field">
            <span>{{ t('adventure.partySize') }}</span>
            <input v-if="partyFigures" :value="partyFigures.size" type="number" disabled />
            <input v-else v-model.number="ideaPartySize" type="number" min="1" max="12" />
          </label>
          <label class="field">
            <span>{{ t('adventure.partyLevel') }}</span>
            <input v-if="partyFigures" :value="partyFigures.level" type="number" disabled />
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
          <RouterLink :to="{ name: 'settings' }" @click="close">
            {{ t('claude.changeInSettings') }}
          </RouterLink>
        </p>
        <AiHandoff primary :task="task" :request="t('ai.tasks.newAdventure')">
          <AiExchange
            steps
            :build-prompt="buildPrompt"
            :parse="parse"
            :take="take"
            :import-label="t('claude.importAnswer')"
          />
        </AiHandoff>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.field input[type='number'] {
  width: 6rem;
}

.end {
  justify-content: flex-end;
}
</style>
