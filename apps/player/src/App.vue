<script setup lang="ts">
import { LogOut, ScrollText } from '@lucide/vue';
import { onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import JoinForm from './components/JoinForm.vue';
import SignUp from './components/SignUp.vue';
import TableView from './components/TableView.vue';
import { type Locale, rememberLocale } from './i18n';
import { useJoin } from './lib/join';
import { useTable } from './lib/table';

const { t, locale } = useI18n();
const table = useTable();
const { status, view, sendInitiative } = table;

// The QR code opens this page with ?code=…; the code is remembered for rejoining.
const params = new URLSearchParams(window.location.search);
const codeFromLink = params.get('code')?.toUpperCase();
// The sign-up link of a party opens it with ?signup=… instead.
const signUpCode = params.get('signup')?.toUpperCase();
const { name, code, characterId, joined, characters, submit, leave } = useJoin(table, {
  codeFromLink,
  skip: signUpCode !== undefined,
});

/**
 * Whether the game master app opens on this device: with a password it does everywhere, without
 * one only on the computer Lorewarden runs on. Otherwise the link back to it would lead here again.
 */
const gameMasterReachable = ref(false);
async function checkGameMaster() {
  try {
    const response = await fetch('/api/auth/status');
    if (!response.ok) return;
    const status = (await response.json()) as { password?: string; local?: boolean };
    gameMasterReachable.value = (status.password ?? 'none') !== 'none' || status.local === true;
  } catch {
    // Without an answer the link stays hidden.
  }
}

onMounted(() => {
  void checkGameMaster();
  if (codeFromLink && !signUpCode) window.history.replaceState(null, '', window.location.pathname);
});

// Screen readers and hyphenation follow the language picked on the phone.
watch(
  locale,
  (value) => {
    document.documentElement.lang = value;
  },
  { immediate: true },
);

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
        <button class="link" type="button" @click="leave">
          <LogOut aria-hidden="true" :size="14" />{{ t('table.leave') }}
        </button>
      </p>
    </header>

    <SignUp v-if="signUpCode" :code="signUpCode" />

    <JoinForm
      v-else-if="!joined"
      v-model:name="name"
      v-model:code="code"
      v-model:character-id="characterId"
      :status="status"
      :characters="characters"
      @submit="submit"
    />

    <TableView v-else :status="status" :view="view" :send-initiative="sendInitiative" />

    <p v-if="!signUpCode && !joined && gameMasterReachable" class="muted game-master">
      <a href="/?role=gm">{{ t('join.gameMaster') }}</a>
    </p>

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

.top {
  margin-bottom: 1rem;
}

.top p {
  margin: 0;
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
