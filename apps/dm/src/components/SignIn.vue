<script setup lang="ts">
import { Crown, Users } from '@lucide/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  type AuthError,
  type AuthStatus,
  leaveSetupLink,
  MIN_PASSWORD_LENGTH,
  newPasswordMistake,
  setUp,
  setupToken,
  signIn,
} from '../lib/auth';

const props = defineProps<{ status: AuthStatus }>();

const { t } = useI18n();
const token = setupToken();
const password = ref('');
const repeated = ref('');
const error = ref<AuthError | 'mismatch'>();
const busy = ref(false);

// Players and the game master open the same address of a hosted Lorewarden, so the start page
// asks who is coming. The choice is remembered in this browser.
const ROLE_KEY = 'lorewarden.role';
const PLAYER_PATH = '/play/';
function readRole(): string | null {
  try {
    return localStorage.getItem(ROLE_KEY);
  } catch {
    return null;
  }
}
function rememberRole(role: 'gm' | 'player') {
  try {
    localStorage.setItem(ROLE_KEY, role);
  } catch {
    // Without storage the start page asks again next time.
  }
}
// The player app links here with ?role=gm for a game master who played on this browser before.
const askedForGm = new URLSearchParams(window.location.search).get('role') === 'gm';
if (askedForGm) {
  rememberRole('gm');
  window.history.replaceState(null, '', window.location.pathname + window.location.hash);
}
const chosen = ref(readRole() === 'gm');
// A phone that has been at a table before, or picked "Player" here, goes straight to the player app.
let playedHere = false;
try {
  playedHere = localStorage.getItem('lorewarden.playerId') !== null;
} catch {
  // Without storage the start page asks.
}
if (!askedForGm && (readRole() === 'player' || (readRole() === null && playedHere))) {
  window.location.replace(PLAYER_PATH);
}

function chooseGameMaster() {
  rememberRole('gm');
  chosen.value = true;
}

function choosePlayer() {
  rememberRole('player');
  window.location.assign(PLAYER_PATH);
}

const mode = computed(() => {
  if (props.status.password !== 'none') return 'signIn';
  return token ? 'setUp' : 'noPassword';
});

async function submit() {
  error.value = undefined;
  if (mode.value === 'setUp') {
    error.value = newPasswordMistake(password.value, repeated.value);
    if (error.value) return;
  }
  busy.value = true;
  error.value =
    mode.value === 'setUp' ? await setUp(password.value, token) : await signIn(password.value);
  busy.value = false;
  if (!error.value) leaveSetupLink();
}
</script>

<template>
  <main class="page sign-in">
    <h1>{{ t('app.title') }}</h1>
    <section v-if="mode === 'signIn' && !chosen" class="stack" :aria-label="t('start.heading')">
      <p class="muted">{{ t('start.heading') }}</p>
      <button type="button" class="card role" @click="chooseGameMaster">
        <Crown aria-hidden="true" />
        <span>
          <strong>{{ t('start.gameMaster') }}</strong>
          <span class="hint">{{ t('start.gameMasterHint') }}</span>
        </span>
      </button>
      <button type="button" class="card role" @click="choosePlayer">
        <Users aria-hidden="true" />
        <span>
          <strong>{{ t('start.player') }}</strong>
          <span class="hint">{{ t('start.playerHint') }}</span>
        </span>
      </button>
    </section>
    <section v-else-if="mode === 'noPassword'" class="card stack">
      <h2>{{ t('auth.noPasswordHeading') }}</h2>
      <p>{{ t('auth.noPasswordText') }}</p>
    </section>
    <form v-else class="card stack" @submit.prevent="submit">
      <h2>{{ mode === 'setUp' ? t('auth.setUpHeading') : t('auth.signInHeading') }}</h2>
      <p v-if="mode === 'setUp'" class="hint">{{ t('auth.setUpText', { min: MIN_PASSWORD_LENGTH }) }}</p>
      <label class="field">
        <span>{{ t('auth.password') }}</span>
        <input
          v-model="password"
          type="password"
          required
          :autocomplete="mode === 'setUp' ? 'new-password' : 'current-password'"
          autofocus
        />
      </label>
      <label v-if="mode === 'setUp'" class="field">
        <span>{{ t('auth.repeatPassword') }}</span>
        <input v-model="repeated" type="password" required autocomplete="new-password" />
      </label>
      <p v-if="error" class="error" role="alert">
        {{ t(`auth.errors.${error}`, { min: MIN_PASSWORD_LENGTH }) }}
      </p>
      <div class="row spread">
        <button type="submit" class="primary" :disabled="busy">
          {{ mode === 'setUp' ? t('auth.setUp') : t('auth.signIn') }}
        </button>
        <button v-if="mode === 'signIn'" type="button" class="ghost" @click="choosePlayer">
          {{ t('start.imPlayer') }}
        </button>
      </div>
    </form>
  </main>
</template>

<style scoped>
.sign-in {
  max-width: 28rem;
  margin: 3rem auto;
}

.sign-in h2 {
  margin: 0;
  font-size: 1.1rem;
}

.sign-in p {
  margin: 0;
}

.role {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 1rem;
  width: 100%;
  padding: 1.1rem 1.25rem;
  text-align: left;
  font: inherit;
  color: inherit;
  cursor: pointer;
}

.role:hover {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.role > svg {
  flex: none;
  width: 1.75rem;
  height: 1.75rem;
  color: var(--accent);
}

.role > span {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.role strong {
  font-size: 1.05rem;
}

.spread {
  justify-content: space-between;
}
</style>
