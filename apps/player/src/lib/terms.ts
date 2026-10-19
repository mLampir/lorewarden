import { useI18n } from 'vue-i18n';

/**
 * Rules terms such as "AC" or "Initiative" follow the game master's choice of language for them,
 * which the server passes on with what it sends to the phone.
 */
export function useTerms(termsLanguage: () => string | undefined) {
  const { t } = useI18n();
  return function term(key: string, named: Record<string, unknown> = {}): string {
    return termsLanguage() === 'en' ? t(key, named, { locale: 'en' }) : t(key, named);
  };
}
