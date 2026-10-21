<script setup lang="ts">
import { RefreshCw } from '@lucide/vue';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSettings } from '../composables/useSettings';
import { type Locale, rememberLocale } from '../i18n';
import {
  type AuthError,
  authStatus,
  changePassword,
  MIN_PASSWORD_LENGTH,
  newPasswordMistake,
  setUp,
  signOut,
} from '../lib/auth';
import { languageOptions } from '../lib/languages';
import {
  checkForUpdates,
  dataDir,
  setAutoUpdate,
  startUpdate,
  type UpdaterStatus,
  updateInfo,
  updaterInfo,
} from '../lib/server';

const { t, locale } = useI18n();
const {
  englishTerms,
  adventureLanguageChoice,
  adventureLanguage,
  autoRollInitiative,
  shareInitiativeRolls,
  rollHitPoints,
  askPlayersForInitiative,
  trackPlayerHitPoints,
} = useSettings();

const languages = computed(() => languageOptions(locale.value, adventureLanguageChoice.value));

const currentPassword = ref('');
const newPassword = ref('');
const repeatedPassword = ref('');
const passwordError = ref<AuthError | 'mismatch'>();
const passwordSaved = ref(false);
const mcpUrl = `${window.location.origin}/mcp`;
/** How many AI assistants are connected; undefined if the server offers no MCP endpoint. */
const connectedAssistants = ref<number>();

async function loadConnections() {
  try {
    const response = await fetch('/api/oauth/connections', { cache: 'no-store' });
    connectedAssistants.value = response.ok
      ? ((await response.json()) as { connected: number }).connected
      : undefined;
  } catch {
    connectedAssistants.value = undefined;
  }
}
onMounted(loadConnections);

async function disconnectAssistants() {
  if (!window.confirm(t('connect.disconnectConfirm'))) return;
  await fetch('/api/oauth/connections', { method: 'DELETE' }).catch(() => undefined);
  await loadConnections();
}
const savingPassword = ref(false);

async function savePassword() {
  passwordError.value = undefined;
  passwordSaved.value = false;
  passwordError.value = newPasswordMistake(newPassword.value, repeatedPassword.value);
  if (passwordError.value) return;
  savingPassword.value = true;
  passwordError.value =
    authStatus.value?.password === 'none'
      ? await setUp(newPassword.value)
      : await changePassword(currentPassword.value, newPassword.value);
  savingPassword.value = false;
  if (passwordError.value) return;
  passwordSaved.value = true;
  // A new password disconnects every AI assistant.
  void loadConnections();
  currentPassword.value = '';
  newPassword.value = '';
  repeatedPassword.value = '';
}

const checking = ref(false);
/** What the last "Check for updates" found, unless it found a new release. */
const checkResult = ref<'current' | 'unreachable'>();

async function checkNow() {
  checking.value = true;
  checkResult.value = undefined;
  const result = await checkForUpdates();
  checking.value = false;
  if (result !== 'newer') checkResult.value = result ?? 'unreachable';
}

const updateRefused = ref(false);
const updating = computed(() => updaterInfo.value?.status?.state === 'running');

async function update() {
  updateRefused.value = !(await startUpdate());
}

/** How the last update ended, as one sentence. */
function updateResult(status: UpdaterStatus): string {
  const values = {
    from: status.from ?? '?',
    to: status.to ?? '?',
    error: status.error ?? '',
    date: new Date(status.at).toLocaleString(locale.value),
  };
  return t(`updater.result.${status.state}`, values);
}

function onLocale(event: Event) {
  const value = (event.target as HTMLSelectElement).value as Locale;
  locale.value = value;
  rememberLocale(value);
}
</script>

<template>
  <main class="page">
    <h1>{{ t('settings.heading') }}</h1>
    <p class="hint">{{ t('settings.localNote') }}</p>

    <section class="card stack settings">
      <label class="field">
        <span>{{ t('language') }}</span>
        <select :value="locale" @change="onLocale">
          <option value="en">English</option>
          <option value="de">Deutsch</option>
        </select>
      </label>
      <div class="stack">
        <label class="field">
          <span>{{ t('settings.adventureLanguage') }}</span>
          <select v-model="adventureLanguageChoice">
            <option value="">{{ t('settings.sameAsInterface') }}</option>
            <option v-for="language in languages" :key="language.tag" :value="language.tag">
              {{ language.name }}
            </option>
          </select>
        </label>
        <p class="hint">{{ t('settings.adventureLanguageHint') }}</p>
      </div>
      <div v-if="locale !== 'en' || adventureLanguage !== 'en'">
        <label class="inline">
          <input v-model="englishTerms" type="checkbox" />
          {{ t('englishTerms') }}
        </label>
        <p class="hint">{{ t('englishTermsHint') }}</p>
      </div>
      <p v-if="dataDir" class="hint">{{ t('settings.dataDir', { dir: dataDir }) }}</p>
    </section>

    <section class="card stack settings">
      <h2>{{ t('settings.combat') }}</h2>
      <div>
        <label class="inline">
          <input v-model="autoRollInitiative" type="checkbox" />
          {{ t('settings.autoRollInitiative') }}
        </label>
        <p class="hint">{{ t('settings.autoRollInitiativeHint') }}</p>
      </div>
      <div>
        <label class="inline">
          <input v-model="shareInitiativeRolls" type="checkbox" />
          {{ t('settings.shareInitiativeRolls') }}
        </label>
        <p class="hint">{{ t('settings.shareInitiativeRollsHint') }}</p>
      </div>
      <div>
        <label class="inline">
          <input v-model="rollHitPoints" type="checkbox" />
          {{ t('settings.rollHitPoints') }}
        </label>
        <p class="hint">{{ t('settings.rollHitPointsHint') }}</p>
      </div>
      <div>
        <label class="inline">
          <input v-model="askPlayersForInitiative" type="checkbox" />
          {{ t('settings.askPlayersForInitiative') }}
        </label>
        <p class="hint">{{ t('settings.askPlayersForInitiativeHint') }}</p>
      </div>
      <div>
        <label class="inline">
          <input v-model="trackPlayerHitPoints" type="checkbox" />
          {{ t('settings.trackPlayerHitPoints') }}
        </label>
        <p class="hint">{{ t('settings.trackPlayerHitPointsHint') }}</p>
      </div>
    </section>

    <section v-if="authStatus" class="card stack settings">
      <h2>{{ t('auth.heading') }}</h2>
      <template v-if="authStatus.password === 'environment'">
        <p class="hint">{{ t('auth.fromEnvironment') }}</p>
      </template>
      <form v-else class="stack" @submit.prevent="savePassword">
        <p class="hint">
          {{
            authStatus.password === 'none'
              ? t('auth.noPasswordHint', { min: MIN_PASSWORD_LENGTH })
              : t('auth.changeHint', { min: MIN_PASSWORD_LENGTH })
          }}
        </p>
        <label v-if="authStatus.password === 'settings'" class="field">
          <span>{{ t('auth.currentPassword') }}</span>
          <input
            v-model="currentPassword"
            type="password"
            required
            autocomplete="current-password"
          />
        </label>
        <label class="field">
          <span>{{ t('auth.newPassword') }}</span>
          <input v-model="newPassword" type="password" required autocomplete="new-password" />
        </label>
        <label class="field">
          <span>{{ t('auth.repeatPassword') }}</span>
          <input v-model="repeatedPassword" type="password" required autocomplete="new-password" />
        </label>
        <p v-if="passwordError" class="error" role="alert">
          {{ t(`auth.errors.${passwordError}`, { min: MIN_PASSWORD_LENGTH }) }}
        </p>
        <p v-if="passwordSaved" role="status">{{ t('auth.saved') }}</p>
        <div class="row">
          <button type="submit" :disabled="savingPassword">
            {{ authStatus.password === 'none' ? t('auth.setPassword') : t('auth.changePassword') }}
          </button>
        </div>
      </form>
      <p v-if="authStatus.password !== 'none'" class="hint">{{ t('auth.resetHint') }}</p>
      <div v-if="authStatus.password !== 'none'" class="row">
        <button type="button" @click="signOut">{{ t('auth.signOut') }}</button>
      </div>
    </section>

    <section v-if="connectedAssistants !== undefined" class="card stack settings">
      <h2>{{ t('connect.settingsHeading') }}</h2>
      <p class="hint">{{ t('connect.settingsHint') }}</p>
      <pre class="update-commands">{{ mcpUrl }}</pre>
      <p v-if="authStatus?.password === 'none'" class="hint">
        {{ t('connect.needsPasswordSettings') }}
      </p>
      <p>{{ t('connect.connected', connectedAssistants) }}</p>
      <div v-if="connectedAssistants > 0" class="row">
        <button type="button" @click="disconnectAssistants">{{ t('connect.disconnect') }}</button>
      </div>
    </section>

    <section v-if="updateInfo.current" class="card stack settings version">
      <h2>{{ t('settings.version') }}</h2>
      <p>
        {{
          updateInfo.current === 'dev'
            ? t('settings.devVersion')
            : t('settings.currentVersion', { version: updateInfo.current })
        }}
      </p>
      <template v-if="updateInfo.canCheck && !updateInfo.latest">
        <div class="row">
          <button type="button" :disabled="checking" @click="checkNow">
            <RefreshCw :size="16" aria-hidden="true" />
            {{ t('settings.checkForUpdates') }}
          </button>
        </div>
        <p v-if="checkResult" class="hint" role="status">
          {{ t(`settings.checkResult.${checkResult}`) }}
        </p>
      </template>
      <template v-if="updateInfo.latest">
        <p>
          <strong>{{ t('settings.updateAvailable', { version: updateInfo.latest }) }}</strong>{{ ' ' }}
          <a v-if="updateInfo.url" :href="updateInfo.url" target="_blank" rel="noopener">
            {{ t('settings.releaseNotes') }}
          </a>
        </p>
      </template>
      <template v-if="updaterInfo">
        <p v-if="updating" role="status">
          {{ t(`updater.step.${updaterInfo.status?.step ?? 'pulling'}`) }}
        </p>
        <p v-else-if="updaterInfo.status && updaterInfo.status.state !== 'idle'" class="hint">
          {{ updateResult(updaterInfo.status) }}
        </p>
        <p v-if="!updaterInfo.status || updateRefused" class="error" role="alert">
          {{ t('updater.unreachable') }}
        </p>
        <template v-if="updateInfo.latest && !updating">
          <div class="row">
            <button type="button" class="primary" @click="update">
              <RefreshCw :size="16" aria-hidden="true" />
              {{ t('updater.update', { version: updateInfo.latest }) }}
            </button>
          </div>
          <p class="hint">{{ t('updater.updateHint') }}</p>
        </template>
        <div>
          <label class="inline">
            <input
              type="checkbox"
              :checked="updaterInfo.auto"
              @change="setAutoUpdate(($event.target as HTMLInputElement).checked)"
            />
            {{ t('updater.auto') }}
          </label>
          <p class="hint">{{ t('updater.autoHint') }}</p>
        </div>
      </template>
      <template v-else-if="updateInfo.latest">
        <p class="hint">{{ t('settings.howToUpdate') }}</p>
        <pre class="update-commands">docker compose pull &amp;&amp; docker compose up -d</pre>
        <p class="hint">{{ t('settings.howToUpdateSource') }}</p>
      </template>
    </section>
  </main>
</template>

<style scoped>
.settings {
  max-width: 40rem;
  margin-top: 1rem;
}

.version p {
  margin: 0;
}

.settings h2 {
  margin: 0;
  font-size: 1rem;
}

.update-commands {
  margin: 0;
  padding: 0.5rem 0.75rem;
  overflow-x: auto;
  border-radius: var(--radius);
  background: var(--surface-2);
}
</style>
