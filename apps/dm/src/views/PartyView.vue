<script setup lang="ts">
import { createCharacter, createParty, type Party, partyNumbers } from '@lorewarden/core';
import { Plus, UserPlus } from '@lucide/vue';
import { nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import CharacterEditor from '../components/CharacterEditor.vue';
import { useAutosave } from '../composables/useAutosave';
import { useParties } from '../composables/useParties';
import { fillIfBlank } from '../lib/fallback';

const { t } = useI18n();
const route = useRoute();
const { parties, save, remove: removeParty } = useParties();

const detail = ref<HTMLElement>();
/** A copy of the party being edited; changes are saved shortly after typing. */
const editing = ref<Party>();
const { failed: saveFailed, markSaved, flush } = useAutosave(editing, save);

function summary(party: Party): string {
  if (party.characters.length === 0) return t('party.empty');
  const { size, level } = partyNumbers(party);
  return t('party.summary', { size, level });
}

async function open(party: Party) {
  await flush();
  const copy = structuredClone(party);
  markSaved(copy);
  editing.value = copy;
  await nextTick();
  const top = detail.value?.getBoundingClientRect().top;
  if (top !== undefined && (top < 0 || top > window.innerHeight * 0.6)) {
    detail.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// Opened from an adventure with ?id=…: show that party.
watch(
  [parties, () => route.query.id],
  ([list, id]) => {
    if (editing.value || typeof id !== 'string') return;
    const party = list.find((p) => p.id === id);
    if (party) void open(party);
  },
  { immediate: true },
);

const createFailed = ref(false);

async function add() {
  const party = createParty(t('party.newName'));
  party.characters.push(createCharacter(t('party.newCharacter')));
  try {
    await save(party);
  } catch {
    createFailed.value = true;
    return;
  }
  createFailed.value = false;
  await open(party);
}

function addCharacter() {
  const party = editing.value;
  if (!party) return;
  const level = party.characters.length > 0 ? partyNumbers(party).level : 1;
  party.characters.push(createCharacter(t('party.newCharacter'), level));
}

function removeCharacter(index: number) {
  const party = editing.value;
  const character = party?.characters[index];
  if (!party || !character) return;
  if (!window.confirm(t('party.removeCharacterConfirm', { name: character.name }))) return;
  party.characters.splice(index, 1);
}

async function remove() {
  const party = editing.value;
  if (!party || !window.confirm(t('party.deleteConfirm', { name: party.name }))) return;
  markSaved(undefined);
  editing.value = undefined;
  await removeParty(party.id);
}
</script>

<template>
  <main class="page">
    <header class="page-header">
      <div>
        <h1>{{ t('party.heading') }}</h1>
        <p class="muted">{{ t('party.intro') }}</p>
      </div>
      <div class="row">
        <button class="primary" @click="add"><Plus aria-hidden="true" />{{ t('party.new') }}</button>
      </div>
    </header>

    <p v-if="createFailed" class="error" role="alert">{{ t('party.createFailed') }}</p>

    <section class="master-detail">
      <div class="card browser">
        <ul v-if="parties.length > 0" class="list">
          <li v-for="party in parties" :key="party.id">
            <button class="entry" :aria-current="party.id === editing?.id" @click="open(party)">
              <span>{{ party.id === editing?.id ? editing.name : party.name }}</span>
              <span class="hint">{{ summary(party.id === editing?.id ? editing : party) }}</span>
            </button>
          </li>
        </ul>
        <p v-else class="hint">{{ t('party.none') }}</p>
      </div>

      <div ref="detail" class="detail stack">
        <template v-if="editing">
          <div class="card stack">
            <label class="field">
              <span>{{ t('party.name') }}</span>
              <input
                v-model="editing.name"
                required
                maxlength="60"
                @blur="editing && fillIfBlank(editing, 'name', t('party.newName'))"
              />
            </label>
            <p class="hint">{{ t('party.linkHint') }}</p>
          </div>
          <p v-if="saveFailed" class="error" role="alert">{{ t('common.saveFailed') }}</p>
          <CharacterEditor
            v-for="(character, index) in editing.characters"
            :key="character.id"
            :character="character"
            @remove="removeCharacter(index)"
          />
          <div class="row spread">
            <button @click="addCharacter">
              <UserPlus aria-hidden="true" />{{ t('party.addCharacter') }}
            </button>
            <button class="danger" type="button" @click="remove">{{ t('party.delete') }}</button>
          </div>
        </template>
        <div v-else class="card placeholder">
          <p class="muted">{{ parties.length > 0 ? t('party.choose') : t('party.start') }}</p>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
@media (min-width: 721px) {
  .master-detail {
    grid-template-columns: minmax(14rem, 18rem) 1fr;
  }
}

.browser {
  align-self: start;
  position: sticky;
  top: 4.25rem;
  padding: 0.5rem;
}

.list button.entry {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.entry .hint {
  font-size: 0.8rem;
  font-weight: 400;
}

.detail {
  min-width: 0;
  scroll-margin-top: 4.25rem;
}

.spread {
  justify-content: space-between;
}

.placeholder {
  display: grid;
  place-items: center;
  min-height: 12rem;
}

@media (max-width: 720px) {
  .browser {
    position: static;
  }
}
</style>
