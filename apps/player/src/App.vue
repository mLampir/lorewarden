<script setup lang="ts">
import type { PlayerReveal, TableInfo } from '@lorewarden/core';
import { Hourglass, LogOut, ScrollText, Swords, X } from '@lucide/vue';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import SignUp from './components/SignUp.vue';
import { type Locale, rememberLocale } from './i18n';
import { playerId, read, write } from './lib/storage';
import { useTable } from './lib/table';

const { t, d, locale } = useI18n();
const { status, view, join, leave, sendInitiative } = useTable();

const NAME_KEY = 'lorewarden.playerName';
const CODE_KEY = 'lorewarden.joinCode';
const CHARACTER_KEY = 'lorewarden.characterId';
/** Set once the phone entered a character of a party, so it can join without the table's code. */
const SEAT_KEY = 'lorewarden.joinWithParty';
/** How often a phone that entered a character asks whether its party is being played. */
const SEAT_POLL_MS = 10_000;
/** Picked in the character list for a player who plays none of the party's characters. */
const SOMEONE_ELSE = '';

// The QR code opens this page with ?code=…; the code is remembered for rejoining.
const params = new URLSearchParams(window.location.search);
const codeFromLink = params.get('code')?.toUpperCase();
// The sign-up link of a party opens it with ?signup=… instead.
const signUpCode = params.get('signup')?.toUpperCase();
const name = ref(read(NAME_KEY) ?? '');
const code = ref(codeFromLink ?? read(CODE_KEY) ?? '');
const characterId = ref(read(CHARACTER_KEY) ?? SOMEONE_ELSE);
const joined = ref(false);
const enlarged = ref<PlayerReveal>();
const fresh = ref(new Set<string>());

/** The table behind the code, with the characters a player can pick. */
const info = ref<TableInfo>();
const characters = computed(() => info.value?.characters ?? []);
const picked = computed(() => characters.value.find((c) => c.id === characterId.value));

async function loadInfo(value: string) {
  info.value = undefined;
  if (!/^[A-Z0-9]{6}$/i.test(value.trim())) return;
  try {
    const response = await fetch(`/api/player/table?code=${encodeURIComponent(value.trim())}`);
    if (response.ok) info.value = (await response.json()) as TableInfo;
  } catch {
    // Without the list the player joins with a name, as before.
  }
}

watch(code, (value) => void loadInfo(value));

function submit() {
  const character = picked.value;
  const trimmedName = (character?.name ?? name.value).trim();
  const trimmedCode = code.value.trim().toUpperCase();
  if (!trimmedName || !trimmedCode) return;
  if (!character) write(NAME_KEY, trimmedName);
  write(CODE_KEY, trimmedCode);
  write(CHARACTER_KEY, character?.id ?? null);
  join(trimmedCode, playerId(), trimmedName, character?.id);
  joined.value = true;
}

/**
 * A phone that entered a character of the party the game master plays with right now joins with
 * that character, without the table's code. Players of other groups join with the code as before.
 */
async function joinWithParty(): Promise<boolean> {
  if (joined.value || read(SEAT_KEY) === null) return false;
  try {
    const response = await fetch(`/api/player/seat?id=${encodeURIComponent(playerId())}`);
    if (response.status !== 200) return false;
    const seat = (await response.json()) as { code: string; characterId: string };
    if (joined.value) return false;
    code.value = seat.code;
    await loadInfo(seat.code);
    characterId.value = seat.characterId;
    if (!picked.value) return false;
    submit();
    return true;
  } catch {
    return false;
  }
}

let seatTimer: ReturnType<typeof setInterval> | undefined;
onUnmounted(() => clearInterval(seatTimer));

/** Leaving forgets the code and the party, so the phone does not join again on the next visit. */
function leaveTable() {
  leave();
  joined.value = false;
  write(CODE_KEY, null);
  write(SEAT_KEY, null);
  code.value = '';
}

onMounted(async () => {
  if (signUpCode) return;
  if (codeFromLink) window.history.replaceState(null, '', window.location.pathname);
  await loadInfo(code.value);
  if (characterId.value !== SOMEONE_ELSE && !picked.value) characterId.value = SOMEONE_ELSE;
  // Back at the table with the same phone: join right away.
  if ((picked.value || name.value.trim()) && code.value.trim()) submit();
  else await joinWithParty();
  // Until the game master starts playing with the party, the join screen keeps asking.
  seatTimer = setInterval(() => void joinWithParty(), SEAT_POLL_MS);
});

watch(status, (value) => {
  if (value === 'wrong-code') {
    joined.value = false;
    write(CODE_KEY, null);
    code.value = '';
    // A renewed code: the party still gets the phone to the table.
    void joinWithParty();
  }
});

// Highlight what has just been revealed and let the phone buzz.
let known: Set<string> | undefined;
watch(view, (value) => {
  const ids = new Set(value?.reveals.map((r) => r.id) ?? []);
  const added = known ? [...ids].filter((id) => !known?.has(id)) : [];
  known = ids;
  if (added.length === 0) return;
  fresh.value = new Set(added);
  navigator.vibrate?.(200);
  setTimeout(() => {
    fresh.value = new Set();
  }, 4000);
});

// The game master asks for initiative: the prompt stays at the top until combat is under way.
const initiative = ref<number>();
const editingInitiative = ref(false);
const sendingInitiative = ref(false);
const initiativeFailed = ref(false);
const initiativeInput = ref<HTMLInputElement>();

watch(
  () => view.value?.initiative?.at,
  (at, before) => {
    if (!at || at === before) return;
    initiative.value = undefined;
    editingInitiative.value = false;
    initiativeFailed.value = false;
    navigator.vibrate?.(200);
  },
);

async function submitInitiative() {
  const value = initiative.value;
  if (value === undefined || !Number.isInteger(value)) return;
  sendingInitiative.value = true;
  initiativeFailed.value = !(await sendInitiative(value));
  sendingInitiative.value = false;
  if (!initiativeFailed.value) editingInitiative.value = false;
}

async function changeInitiative() {
  initiative.value = view.value?.initiative?.value;
  editingInitiative.value = true;
  await nextTick();
  initiativeInput.value?.focus();
}

function onLocale(event: Event) {
  const value = (event.target as HTMLSelectElement).value as Locale;
  locale.value = value;
  rememberLocale(value);
}
</script>

<template>
  <main>
    <div class="brand">
      <span class="brand-mark" aria-hidden="true"><ScrollText :size="16" /></span>
      {{ t('app.title') }}
    </div>
    <header class="top">
      <h1 v-if="signUpCode">{{ t('signUp.heading') }}</h1>
      <h1 v-else>{{ (joined && view?.title) || t('join.heading') }}</h1>
      <p v-if="joined && view" class="muted who">
        <span class="dot" :class="{ online: status === 'connected' }" aria-hidden="true" />
        {{ t('table.playingAs', { name: view.player.name }) }}
        <button class="link" type="button" @click="leaveTable">
          <LogOut aria-hidden="true" :size="14" />{{ t('table.leave') }}
        </button>
      </p>
    </header>

    <SignUp v-if="signUpCode" :code="signUpCode" />

    <form v-else-if="!joined" class="card stack" @submit.prevent="submit">
      <p>{{ t('app.tagline') }}</p>
      <p v-if="status === 'wrong-code'" class="error" role="alert">{{ t('join.wrongCode') }}</p>
      <fieldset v-if="characters.length > 0" class="field characters">
        <legend>{{ t('join.character') }}</legend>
        <label v-for="character in characters" :key="character.id" class="choice">
          <input v-model="characterId" type="radio" name="character" :value="character.id" />
          <span>{{ character.name }}</span>
          <small v-if="character.taken" class="muted">{{ t('join.taken') }}</small>
        </label>
        <label class="choice">
          <input v-model="characterId" type="radio" name="character" :value="SOMEONE_ELSE" />
          <span>{{ t('join.someoneElse') }}</span>
        </label>
      </fieldset>
      <label v-if="!picked" class="field">
        <span>{{ t('join.name') }}</span>
        <input v-model="name" required maxlength="40" autocomplete="nickname" />
        <small class="muted">{{ t('join.nameHint') }}</small>
      </label>
      <label class="field">
        <span>{{ t('join.code') }}</span>
        <input
          v-model="code"
          required
          maxlength="6"
          autocapitalize="characters"
          autocomplete="off"
          spellcheck="false"
          class="code"
        />
        <small class="muted">{{ t('join.codeHint') }}</small>
      </label>
      <button class="primary" type="submit">{{ t('join.submit') }}</button>
    </form>
    <p v-if="!signUpCode && !joined" class="muted game-master">
      <a href="/?role=gm">{{ t('join.gameMaster') }}</a>
    </p>

    <template v-else>
      <p v-if="status === 'connecting'" class="notice">{{ t('table.connecting') }}</p>
      <p v-else-if="status === 'offline'" class="notice error" role="status">
        {{ t('table.offline') }}
      </p>
      <p v-else-if="status === 'waiting'" class="notice">{{ t('table.waiting') }}</p>

      <section
        v-if="view?.initiative"
        class="card initiative"
        :aria-label="t('table.initiative.heading')"
      >
        <h2 class="initiative-head">
          <Swords aria-hidden="true" :size="18" />{{ t('table.initiative.heading') }}
        </h2>
        <p
          v-if="view.initiative.value !== undefined && !editingInitiative"
          class="initiative-sent"
          role="status"
        >
          {{ t('table.initiative.sent', { value: view.initiative.value }) }}
          <button class="link" type="button" @click="changeInitiative">
            {{ t('table.initiative.change') }}
          </button>
        </p>
        <form v-else class="initiative-form" @submit.prevent="submitInitiative">
          <p class="muted">{{ t('table.initiative.hint') }}</p>
          <div class="initiative-row">
            <input
              ref="initiativeInput"
              v-model.number="initiative"
              type="number"
              inputmode="numeric"
              min="-10"
              max="99"
              required
              :aria-label="t('table.initiative.value')"
            />
            <button class="primary" type="submit" :disabled="sendingInitiative">
              {{ t('table.initiative.send') }}
            </button>
          </div>
          <p v-if="initiativeFailed" class="error" role="alert">
            {{ t('table.initiative.failed') }}
          </p>
        </form>
      </section>

      <div v-if="view && view.reveals.length === 0" class="card empty">
        <span class="empty-icon" aria-hidden="true"><Hourglass :size="24" /></span>
        <p class="muted">{{ t('table.empty') }}</p>
      </div>
      <ul v-if="view" class="reveals">
        <li
          v-for="reveal in view.reveals"
          :key="reveal.id"
          class="card reveal"
          :class="{ fresh: fresh.has(reveal.id) }"
        >
          <div class="reveal-head">
            <span v-if="reveal.tag" class="badge quiet">{{ t(`table.${reveal.tag}`) }}</span>
            <h2>{{ reveal.title }}</h2>
            <span v-if="reveal.solved" class="badge solved">{{ t('table.solved') }}</span>
            <span v-if="reveal.personal" class="badge">{{ t('table.personal') }}</span>
            <span v-if="fresh.has(reveal.id)" class="badge new">{{ t('table.new') }}</span>
            <time class="muted" :datetime="reveal.at">{{ d(new Date(reveal.at), 'time') }}</time>
          </div>
          <button
            v-if="reveal.imageUrl"
            class="image-button"
            type="button"
            :aria-label="t('table.enlarge', { title: reveal.title })"
            @click="enlarged = reveal"
          >
            <img :src="reveal.imageUrl" :alt="reveal.title" loading="lazy" />
          </button>
          <p v-if="reveal.text" class="text">{{ reveal.text }}</p>
        </li>
      </ul>
    </template>

    <div
      v-if="enlarged"
      class="viewer"
      role="dialog"
      :aria-label="enlarged.title"
      @click="enlarged = undefined"
    >
      <img :src="enlarged.imageUrl" :alt="enlarged.title" />
      <button class="close" type="button" @click="enlarged = undefined">
        <X aria-hidden="true" :size="18" />{{ t('table.close') }}
      </button>
    </div>

    <footer class="muted">
      <label>
        {{ t('language') }}
        <select :value="locale" @change="onLocale">
          <option value="en">English</option>
          <option value="de">Deutsch</option>
        </select>
      </label>
      <a href="https://github.com/mLampir/lorewarden">{{ t('sourceCode') }}</a>
    </footer>
  </main>
</template>

<style>
:root {
  --bg: #f6f4ef;
  --surface: #ffffff;
  --text: #22201c;
  --muted: #6b665d;
  --surface-2: #f0ebe2;
  --border: #e0d9cc;
  --border-strong: #cbc2b2;
  --accent: #7a4a14;
  --accent-soft: #f4e6d2;
  --accent-text: #ffffff;
  --danger: #a3261f;
  --ok: #2f6b3a;
  --focus: #c27a1e;
  --radius: 12px;
  --shadow: 0 1px 2px rgb(40 30 15 / 6%), 0 4px 12px rgb(40 30 15 / 6%);
  color-scheme: light;
  font-family: "Inter Variable", system-ui, -apple-system, "Segoe UI", sans-serif;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #14120e;
    --surface: #1e1b16;
    --text: #ece6d9;
    --muted: #a39b8b;
    --surface-2: #29251e;
    --border: #353027;
    --border-strong: #4a4337;
    --accent: #d9953f;
    --accent-soft: #3a2a15;
    --accent-text: #17150f;
    --shadow: 0 1px 2px rgb(0 0 0 / 30%), 0 4px 12px rgb(0 0 0 / 25%);
    --danger: #f07a6e;
    --ok: #7cc48a;
    color-scheme: dark;
  }
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
}

a {
  color: var(--accent);
}

button,
input,
select,
textarea {
  font: inherit;
}

:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

/* Shared with the components. */
.notice {
  margin: 0 0 0.75rem;
  padding: 0.6rem 0.8rem;
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--muted);
}

.notice.error {
  color: var(--danger);
}

h2 {
  font-size: 1.1rem;
  margin: 0;
}

.muted {
  color: var(--muted);
}

.error {
  color: var(--danger);
}

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.1rem;
  box-shadow: var(--shadow);
}

.stack {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.field span {
  font-weight: 600;
}

input:not([type='radio']),
textarea {
  padding: 0.7rem 0.8rem;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
}

input:not([type='radio']):focus,
textarea:focus {
  outline: none;
  border-color: var(--focus);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--focus) 25%, transparent);
}

.primary {
  padding: 0.8rem 1rem;
  border: none;
  border-radius: 8px;
  font-size: 1.05rem;
  background: var(--accent);
  color: var(--accent-text);
  font-weight: 600;
}

.link {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  margin-left: auto;
  border: none;
  background: none;
  padding: 0.2rem 0;
  color: var(--accent);
  font-weight: 500;
}
</style>

<style scoped>
.game-master {
  margin: 0;
  text-align: center;
  font-size: 0.9rem;
}

main {
  max-width: 40rem;
  margin: 0 auto;
  padding: 1rem 1rem 2rem;
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
  font-weight: 700;
  font-size: 0.95rem;
}

.brand-mark {
  display: inline-grid;
  place-items: center;
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 7px;
  background: var(--accent);
  color: var(--accent-text);
}

h1 {
  font-size: 1.6rem;
  line-height: 1.2;
  letter-spacing: -0.01em;
  margin: 0 0 0.35rem;
}

.who {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  background: var(--border-strong);
}

.dot.online {
  background: var(--ok);
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 2rem 1.25rem;
  text-align: center;
}

.empty p {
  margin: 0;
}

.empty-icon {
  display: grid;
  place-items: center;
  width: 3rem;
  height: 3rem;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent);
}

.top {
  margin-bottom: 1rem;
}

.top p {
  margin: 0;
}

.characters {
  margin: 0;
  padding: 0;
  border: none;
}

.characters legend {
  margin-bottom: 0.35rem;
  padding: 0;
  font-weight: 600;
}

.choice {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.55rem 0.75rem;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
}

.choice:has(input:checked) {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.choice input {
  margin: 0;
  accent-color: var(--accent);
}

.choice small {
  margin-left: auto;
}

.code {
  font-family: ui-monospace, monospace;
  font-size: 1.4rem;
  letter-spacing: 0.3em;
  text-transform: uppercase;
}

.initiative {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin-bottom: 0.75rem;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft), var(--shadow);
}

.initiative-head {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.initiative-head svg {
  color: var(--accent);
}

.initiative p {
  margin: 0;
}

.initiative-form {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.initiative-row {
  display: flex;
  gap: 0.5rem;
}

.initiative-row input {
  width: 6rem;
  font-size: 1.4rem;
  font-weight: 700;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.initiative-row .primary {
  flex: 1;
}

.initiative-sent {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.1rem;
  font-weight: 600;
}

.reveals {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.reveal {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  transition: box-shadow 0.3s;
}

.reveal.fresh {
  box-shadow: 0 0 0 3px var(--accent);
}

.reveal-head {
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
  flex-wrap: wrap;
}

.reveal-head time {
  margin-left: auto;
  font-size: 0.85rem;
}

.badge {
  font-size: 0.8rem;
  padding: 0.05rem 0.5rem;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-text);
}

.badge.quiet {
  background: none;
  color: var(--accent);
  border: 1px solid var(--accent);
}

.badge.new {
  background: var(--focus);
}

.badge.solved {
  background: var(--ok);
  color: var(--accent-text);
}

.image-button {
  padding: 0;
  border: none;
  background: none;
}

.image-button img {
  display: block;
  width: 100%;
  border-radius: var(--radius);
}

.text {
  margin: 0;
  white-space: pre-line;
  font-family: Georgia, "Iowan Old Style", "Palatino Linotype", serif;
  font-size: 1.1rem;
  line-height: 1.6;
}

.viewer {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(0 0 0 / 0.92);
}

.viewer img {
  /* The full size, so drawings without a size of their own fill the screen as well. */
  width: 100%;
  height: 100%;
  object-fit: contain;
  touch-action: pinch-zoom;
}

.viewer .close {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  padding: 0.5rem 0.9rem;
  border: none;
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
}

footer select {
  margin-left: 0.25rem;
  padding: 0.2rem 0.4rem;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
}

footer {
  margin-top: 3rem;
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: space-between;
  font-size: 0.875rem;
}
</style>
