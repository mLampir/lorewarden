<script setup lang="ts">
import type { SignUpCharacter, SignUpView } from '@lorewarden/core';
import { Pencil, UserPlus } from '@lucide/vue';
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { playerId, read, write } from '../lib/storage';
import { useTerms } from '../lib/terms';

/** Players enter their characters for the game master while the sign-up of a party is open. */
const props = defineProps<{ code: string }>();
const { t } = useI18n();

type Draft = Omit<SignUpCharacter, 'ac' | 'maxHp' | 'passivePerception'> & {
  id?: string;
  ac?: number | '';
  maxHp?: number | '';
  passivePerception?: number | '';
};

const view = ref<SignUpView>();
const term = useTerms(() => view.value?.termsLanguage);
const state = ref<'loading' | 'ready' | 'closed' | 'offline'>('loading');
const draft = ref<Draft>();
const saving = ref(false);
const failed = ref(false);
const saved = ref(false);
/** Backstory and goals are optional and folded away until the player opens them. */
const story = ref(false);

const numbers = [
  { key: 'ac', label: 'signUp.ac', min: 0, max: 40 },
  { key: 'maxHp', label: 'signUp.maxHp', min: 1, max: 999 },
  { key: 'passivePerception', label: 'signUp.passivePerception', min: -10, max: 40 },
] as const;

async function load() {
  const query = new URLSearchParams({ code: props.code, id: playerId() });
  try {
    const response = await fetch(`/api/player/signup?${query}`);
    if (!response.ok) {
      state.value = 'closed';
      return;
    }
    view.value = (await response.json()) as SignUpView;
    state.value = 'ready';
    if (view.value.mine.length === 0 && view.value.canAdd) startNew();
  } catch {
    state.value = 'offline';
  }
}

onMounted(load);

function startNew() {
  saved.value = false;
  story.value = false;
  draft.value = {
    name: '',
    player: read('lorewarden.playerName') ?? '',
    className: '',
    level: 1,
    backstory: '',
    goals: '',
    playerNotes: '',
  };
}

function edit(character: SignUpView['mine'][number]) {
  saved.value = false;
  draft.value = { ...character };
  story.value = Boolean(character.backstory || character.goals);
}

/** The player app joins with the character entered here, also after leaving the table once. */
function goToTable() {
  write('lorewarden.joinWithParty', '1');
  write('lorewarden.leftTable', null);
}

/** Leaves out empty number fields instead of sending an invalid value. */
function cleaned(value: Draft): SignUpCharacter {
  const { id: _, ac, maxHp, passivePerception, player, ...rest } = value;
  const number = (n: number | '' | undefined) =>
    typeof n === 'number' && Number.isInteger(n) ? n : undefined;
  const entries = {
    ac: number(ac),
    maxHp: number(maxHp),
    passivePerception: number(passivePerception),
  };
  return {
    ...rest,
    name: rest.name.trim(),
    className: rest.className.trim(),
    level: Math.min(Math.max(Math.round(rest.level || 1), 1), 20),
    ...(player?.trim() ? { player: player.trim() } : {}),
    ...Object.fromEntries(Object.entries(entries).filter(([, n]) => n !== undefined)),
  };
}

async function save() {
  const value = draft.value;
  if (!value?.name.trim()) return;
  saving.value = true;
  failed.value = false;
  try {
    const response = await fetch('/api/player/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: props.code,
        id: playerId(),
        ...(value.id ? { characterId: value.id } : {}),
        character: cleaned(value),
      }),
    });
    if (response.status === 403) {
      state.value = 'closed';
      return;
    }
    if (!response.ok) throw new Error(String(response.status));
    const result = (await response.json()) as { characterId: string; view: SignUpView };
    view.value = result.view;
    if (value.player?.trim()) write('lorewarden.playerName', value.player.trim());
    // The join screen picks this character the next time, and joins with it once the game
    // master plays with this party.
    write('lorewarden.characterId', result.characterId);
    write('lorewarden.joinWithParty', '1');
    draft.value = undefined;
    saved.value = true;
  } catch {
    failed.value = true;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section class="stack">
    <p v-if="state === 'loading'" class="notice">{{ t('table.connecting') }}</p>
    <p v-else-if="state === 'offline'" class="notice error" role="alert">{{ t('signUp.offline') }}</p>
    <div v-else-if="state === 'closed'" class="card">
      <p class="muted">{{ t('signUp.closed') }}</p>
    </div>
    <template v-else-if="view">
      <p class="muted">{{ t('signUp.intro', { party: view.party }) }}</p>
      <p v-if="saved" class="notice ok" role="status">{{ t('signUp.saved') }}</p>
      <div v-if="view.atTable" class="card stack">
        <p class="at-table">{{ t('signUp.atTable') }}</p>
        <a class="primary to-table" href="./" @click="goToTable">
          {{ t('signUp.toTable') }}
        </a>
      </div>
      <p v-else-if="view.mine.length > 0" class="muted">{{ t('signUp.later') }}</p>

      <ul v-if="view.mine.length > 0 && !draft" class="mine">
        <li v-for="character in view.mine" :key="character.id" class="card character">
          <div>
            <h2>{{ character.name }}</h2>
            <p class="muted">
              {{ [character.className, term('signUp.levelShort', { level: character.level })].filter(Boolean).join(' · ') }}
            </p>
          </div>
          <button class="link" type="button" @click="edit(character)">
            <Pencil aria-hidden="true" :size="14" />{{ t('signUp.change') }}
          </button>
        </li>
      </ul>

      <form v-if="draft" class="card stack" @submit.prevent="save">
        <h2>{{ draft.id ? t('signUp.changeHeading') : t('signUp.newHeading') }}</h2>
        <label class="field">
          <span>{{ t('signUp.name') }}</span>
          <input v-model="draft.name" required maxlength="60" autocomplete="off" />
        </label>
        <label class="field">
          <span>{{ t('signUp.player') }}</span>
          <input v-model="draft.player" maxlength="40" autocomplete="nickname" />
          <small class="muted">{{ t('signUp.playerHint') }}</small>
        </label>
        <div class="pair">
          <label class="field grow">
            <span>{{ term('signUp.className') }}</span>
            <input v-model="draft.className" maxlength="60" :placeholder="t('signUp.classHint')" />
          </label>
          <label class="field number">
            <span>{{ term('signUp.level') }}</span>
            <input v-model.number="draft.level" type="number" inputmode="numeric" min="1" max="20" required />
          </label>
        </div>
        <div class="numbers">
          <label v-for="field in numbers" :key="field.key" class="field number">
            <span>{{ term(field.label) }}</span>
            <input
              v-model.number="draft[field.key]"
              type="number"
              inputmode="numeric"
              :min="field.min"
              :max="field.max"
            />
          </label>
        </div>
        <details class="story" :open="story" @toggle="story = ($event.target as HTMLDetailsElement).open">
          <summary>{{ t('signUp.story') }}</summary>
          <p class="muted">{{ t('signUp.storyHint') }}</p>
          <label class="field">
            <span>{{ t('signUp.backstory') }}</span>
            <textarea v-model="draft.backstory" rows="5" maxlength="4000" />
            <small class="muted">{{ t('signUp.backstoryHint') }}</small>
          </label>
          <label class="field">
            <span>{{ t('signUp.goals') }}</span>
            <textarea v-model="draft.goals" rows="3" maxlength="1000" />
            <small class="muted">{{ t('signUp.goalsHint') }}</small>
          </label>
        </details>
        <label class="field">
          <span>{{ t('signUp.notes') }}</span>
          <textarea v-model="draft.playerNotes" rows="3" maxlength="2000" />
          <small class="muted">{{ t('signUp.notesHint') }}</small>
        </label>
        <p v-if="failed" class="error" role="alert">{{ t('signUp.failed') }}</p>
        <div class="actions">
          <button class="primary" type="submit" :disabled="saving">{{ t('signUp.save') }}</button>
          <button v-if="view.mine.length > 0" class="link" type="button" @click="draft = undefined">
            {{ t('signUp.cancel') }}
          </button>
        </div>
      </form>

      <button v-if="!draft && view.canAdd" class="secondary" type="button" @click="startNew">
        <UserPlus aria-hidden="true" :size="18" />{{ t('signUp.add') }}
      </button>

      <div v-if="view.others.length > 0" class="others">
        <h2>{{ t('signUp.others') }}</h2>
        <ul>
          <li v-for="(other, i) in view.others" :key="i">
            {{ other.name }}
            <span class="muted">
              {{ [other.className, term('signUp.levelShort', { level: other.level })].filter(Boolean).join(' · ') }}
            </span>
          </li>
        </ul>
      </div>
    </template>
  </section>
</template>

<style scoped>
.at-table {
  margin: 0;
}

.to-table {
  display: block;
  text-align: center;
  text-decoration: none;
}

.story {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.story summary {
  cursor: pointer;
  font-weight: 600;
}

.story[open] summary {
  margin-bottom: 0.25rem;
}

.story > p {
  margin: 0 0 0.5rem;
}

.story .field + .field {
  margin-top: 0.75rem;
}

.mine,
.others ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.character {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.character p {
  margin: 0;
}

.pair,
.numbers {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: flex-end;
}

.grow {
  flex: 1 1 12rem;
}

.number {
  flex: 1 1 6.5rem;
}

.number input {
  width: 100%;
}

.actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.actions .link {
  margin-left: 0;
}

.secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.7rem 1rem;
  border: 1px solid var(--accent);
  border-radius: 8px;
  background: var(--surface);
  color: var(--accent);
  font-weight: 600;
}

.others h2 {
  font-size: 1rem;
  margin: 0.5rem 0;
}

.others li {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.notice.ok {
  color: var(--ok);
}
</style>
