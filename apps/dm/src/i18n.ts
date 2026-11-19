import { createI18n } from 'vue-i18n';
import { readLocal, writeLocal } from './lib/local-storage';
import de from './locales/de.json';
import en from './locales/en.json';

export type Locale = 'en' | 'de';

const STORAGE_KEY = 'lorewarden.locale';

/** The language chosen in the settings, otherwise the one the browser asks for. */
function preferredLocale(): Locale {
  const stored = readLocal(STORAGE_KEY);
  if (stored === 'en' || stored === 'de') return stored;
  return navigator.language.toLowerCase().startsWith('de') ? 'de' : 'en';
}

/** Keeps the interface language for the next visit in this browser. */
export function rememberLocale(locale: Locale) {
  writeLocal(STORAGE_KEY, locale);
}

const datetimeFormats = {
  short: { dateStyle: 'medium', timeStyle: 'short' },
  long: { dateStyle: 'long' },
  time: { hour: '2-digit', minute: '2-digit' },
} as const;

export const i18n = createI18n({
  legacy: false,
  locale: preferredLocale(),
  fallbackLocale: 'en',
  messages: { en, de },
  datetimeFormats: { en: datetimeFormats, de: datetimeFormats },
});
