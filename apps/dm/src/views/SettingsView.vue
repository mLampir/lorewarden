<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useRulesTerms } from '../composables/useRulesTerms';
import { type Locale, rememberLocale } from '../i18n';

const { t, locale } = useI18n();
const { englishTerms } = useRulesTerms();

function onLocale(event: Event) {
  const value = (event.target as HTMLSelectElement).value as Locale;
  locale.value = value;
  rememberLocale(value);
}
</script>

<template>
  <main class="page">
    <RouterLink to="/" class="hint">← {{ t('common.backToLibrary') }}</RouterLink>
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
      <div v-if="locale !== 'en'">
        <label class="inline">
          <input v-model="englishTerms" type="checkbox" />
          {{ t('englishTerms') }}
        </label>
        <p class="hint">{{ t('englishTermsHint') }}</p>
      </div>
    </section>
  </main>
</template>

<style scoped>
.settings {
  max-width: 40rem;
  margin-top: 1rem;
}
</style>
