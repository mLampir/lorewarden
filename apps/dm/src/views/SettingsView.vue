<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { DEFAULT_TABLE_SERVER, useSettings } from '../composables/useSettings';
import { type Locale, rememberLocale } from '../i18n';
import { languageOptions } from '../lib/languages';

const { t, locale } = useI18n();
const { englishTerms, adventureLanguageChoice, adventureLanguage, tableServerChoice } =
  useSettings();

const languages = computed(() => languageOptions(locale.value, adventureLanguageChoice.value));

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
      <div class="stack">
        <label class="field">
          <span>{{ t('settings.tableServer') }}</span>
          <input
            :value="tableServerChoice"
            type="url"
            :placeholder="DEFAULT_TABLE_SERVER"
            @change="tableServerChoice = ($event.target as HTMLInputElement).value"
          />
        </label>
        <p class="hint">{{ t('settings.tableServerHint') }}</p>
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
