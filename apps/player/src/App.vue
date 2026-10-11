<script setup lang="ts">
import type { PlayerReveal } from '@lorewarden/core';
import { onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { type Locale, rememberLocale } from './i18n';
import { playerId, read, write } from './lib/storage';
import { useTable } from './lib/table';

const { t, d, locale } = useI18n();
const { status, view, join, leave } = useTable();

const NAME_KEY = 'lorewarden.playerName';
const CODE_KEY = 'lorewarden.joinCode';

// The QR code opens this page with ?code=…; the code is remembered for rejoining.
const codeFromLink = new URLSearchParams(window.location.search).get('code')?.toUpperCase();
const name = ref(read(NAME_KEY) ?? '');
const code = ref(codeFromLink ?? read(CODE_KEY) ?? '');
const joined = ref(false);
const enlarged = ref<PlayerReveal>();
const fresh = ref(new Set<string>());

function submit() {
  const trimmedName = name.value.trim();
  const trimmedCode = code.value.trim().toUpperCase();
  if (!trimmedName || !trimmedCode) return;
  write(NAME_KEY, trimmedName);
  write(CODE_KEY, trimmedCode);
  join(trimmedCode, playerId(), trimmedName);
  joined.value = true;
}

function leaveTable() {
  leave();
  joined.value = false;
}

onMounted(() => {
  // Back at the table with the same phone: join right away.
  if (name.value.trim() && code.value.trim()) submit();
  if (codeFromLink) window.history.replaceState(null, '', window.location.pathname);
});

watch(status, (value) => {
  if (value === 'wrong-code') {
    joined.value = false;
    write(CODE_KEY, null);
    code.value = '';
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

function onLocale(event: Event) {
  const value = (event.target as HTMLSelectElement).value as Locale;
  locale.value = value;
  rememberLocale(value);
}
</script>

<template>
  <main>
    <header class="top">
      <h1>{{ view?.title || t('app.title') }}</h1>
      <p v-if="joined && view" class="muted">
        {{ t('table.playingAs', { name: view.player.name }) }} ·
        <button class="link" type="button" @click="leaveTable">{{ t('table.leave') }}</button>
      </p>
    </header>

    <form v-if="!joined" class="card stack" @submit.prevent="submit">
      <p>{{ t('app.tagline') }}</p>
      <p v-if="status === 'wrong-code'" class="error" role="alert">{{ t('join.wrongCode') }}</p>
      <label class="field">
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

    <template v-else>
      <p v-if="status === 'connecting'" class="muted">{{ t('table.connecting') }}</p>
      <p v-else-if="status === 'offline'" class="error" role="status">{{ t('table.offline') }}</p>
      <p v-else-if="status === 'waiting'" class="muted">{{ t('table.waiting') }}</p>

      <p v-if="view && view.reveals.length === 0" class="card muted">{{ t('table.empty') }}</p>
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
        {{ t('table.close') }}
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
  --border: #d9d3c7;
  --accent: #7a4a14;
  --accent-text: #ffffff;
  --danger: #a3261f;
  --ok: #2f6b3a;
  --radius: 8px;
  color-scheme: light;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  line-height: 1.45;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #17150f;
    --surface: #221f18;
    --text: #ece6d9;
    --muted: #a39b8b;
    --border: #3d382d;
    --accent: #d9953f;
    --accent-text: #17150f;
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
select {
  font: inherit;
}
</style>

<style scoped>
main {
  max-width: 40rem;
  margin: 0 auto;
  padding: 1rem;
}

h1 {
  font-size: 1.4rem;
  margin: 0 0 0.25rem;
}

h2 {
  font-size: 1.1rem;
  margin: 0;
}

.top {
  margin-bottom: 1rem;
}

.top p {
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
  padding: 1rem;
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

input {
  padding: 0.6rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg);
  color: var(--text);
}

.code {
  font-family: ui-monospace, monospace;
  font-size: 1.4rem;
  letter-spacing: 0.3em;
  text-transform: uppercase;
}

.primary {
  padding: 0.7rem 1rem;
  border: none;
  border-radius: var(--radius);
  background: var(--accent);
  color: var(--accent-text);
  font-weight: 600;
}

.link {
  border: none;
  background: none;
  padding: 0;
  color: var(--accent);
  text-decoration: underline;
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
  font-size: 1.05rem;
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
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  padding: 0.5rem 0.9rem;
  border: none;
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
}

footer {
  margin-top: 3rem;
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: space-between;
  font-size: 0.875rem;
}
</style>
