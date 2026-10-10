import { createI18n } from 'vue-i18n';
import de from './locales/de.json';
import en from './locales/en.json';

export type Locale = 'en' | 'de';

function preferredLocale(): Locale {
  return navigator.language.toLowerCase().startsWith('de') ? 'de' : 'en';
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
