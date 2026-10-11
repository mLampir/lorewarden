import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

const STORAGE_KEY = 'lorewarden.englishTerms';

function load(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

const stored = ref(load());

/**
 * The setting for game masters who know rules terms such as "Poisoned" or "DC" in English although
 * they use the app in another language. It is on by default and kept in this browser.
 */
export function useRulesTerms() {
  const { t, locale } = useI18n();

  const englishTerms = computed({
    get: () => stored.value,
    set: (value: boolean) => {
      stored.value = value;
      try {
        localStorage.setItem(STORAGE_KEY, String(value));
      } catch {
        // Without storage the setting lasts until the page is reloaded.
      }
    },
  });

  /** The language tag new adventures get for their rules terms, if it differs from their text. */
  const termsLanguageFor = (language: string) =>
    stored.value && language !== 'en' ? 'en' : undefined;

  /** Translates a rules term, in English when the setting is on. */
  const term = (key: string) =>
    stored.value && locale.value !== 'en' ? t(key, {}, { locale: 'en' }) : t(key);

  return { englishTerms, termsLanguageFor, term };
}
