import { createI18n } from 'vue-i18n';
import de from './locales/de.json';
import en from './locales/en.json';

export type Locale = 'en' | 'de';

function preferredLocale(): Locale {
  return navigator.language.toLowerCase().startsWith('de') ? 'de' : 'en';
}

export const i18n = createI18n({
  legacy: false,
  locale: preferredLocale(),
  fallbackLocale: 'en',
  messages: { en, de },
});
