<script setup lang="ts">
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
    <section v-if="mode === 'noPassword'" class="card stack">
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
      <div class="row">
        <button type="submit" class="primary" :disabled="busy">
          {{ mode === 'setUp' ? t('auth.setUp') : t('auth.signIn') }}
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
</style>
