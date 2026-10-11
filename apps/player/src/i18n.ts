import { createI18n } from 'vue-i18n';
import { read, write } from './lib/storage';
import de from './locales/de.json';
import en from './locales/en.json';

export type Locale = 'en' | 'de';

const STORAGE_KEY = 'lorewarden.locale';

/** The language chosen before, otherwise the one the browser asks for. */
function preferredLocale(): Locale {
  const stored = read(STORAGE_KEY);
  if (stored === 'en' || stored === 'de') return stored;
  return navigator.language.toLowerCase().startsWith('de') ? 'de' : 'en';
}

export function rememberLocale(locale: Locale) {
  write(STORAGE_KEY, locale);
}

const datetimeFormats = { time: { hour: '2-digit', minute: '2-digit' } } as const;

export const i18n = createI18n({
  legacy: false,
  locale: preferredLocale(),
  fallbackLocale: 'en',
  messages: { en, de },
  datetimeFormats: { en: datetimeFormats, de: datetimeFormats },
});
