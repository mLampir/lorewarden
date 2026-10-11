import { createJoinCode, DEFAULT_TABLE_PORT, JoinCode } from '@lorewarden/core';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

const TERMS_KEY = 'lorewarden.englishTerms';
const LANGUAGE_KEY = 'lorewarden.adventureLanguage';
const TABLE_SERVER_KEY = 'lorewarden.tableServer';
const JOIN_CODE_KEY = 'lorewarden.joinCode';

export const DEFAULT_TABLE_SERVER = `http://localhost:${DEFAULT_TABLE_PORT}`;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Without storage the setting lasts until the page is reloaded.
  }
}

const storedTerms = ref(read(TERMS_KEY) !== 'false');
const storedLanguage = ref(read(LANGUAGE_KEY) ?? '');
const storedTableServer = ref(read(TABLE_SERVER_KEY) ?? '');

/** The code players need to join. It stays the same across adventures until it is renewed. */
const joinCode = ref(read(JOIN_CODE_KEY) ?? '');
if (!JoinCode.safeParse(joinCode.value).success) renewJoinCode();

/** Gives the table a new join code. Phones with the old code have to scan the QR code again. */
export function renewJoinCode() {
  joinCode.value = createJoinCode();
  write(JOIN_CODE_KEY, joinCode.value);
}

/** Settings of the game master app. They are kept in this browser. */
export function useSettings() {
  const { t, locale } = useI18n();

  /**
   * For game masters who know rules terms such as "Poisoned" or "DC" in English although they
   * play in another language. On by default.
   */
  const englishTerms = computed({
    get: () => storedTerms.value,
    set: (value: boolean) => {
      storedTerms.value = value;
      write(TERMS_KEY, String(value));
    },
  });

  /** Language tag chosen for new adventures; empty means the interface language. */
  const adventureLanguageChoice = computed({
    get: () => storedLanguage.value,
    set: (value: string) => {
      storedLanguage.value = value;
      write(LANGUAGE_KEY, value);
    },
  });

  /** Language tag new adventures are written in. */
  const adventureLanguage = computed(() => storedLanguage.value || locale.value);

  /** Language tag of rules terms in new adventures, if it differs from their text. */
  const termsLanguage = computed(() =>
    storedTerms.value && adventureLanguage.value !== 'en' ? 'en' : undefined,
  );

  /** Translates a rules term in the interface, in English when the setting is on. */
  const term = (key: string) =>
    storedTerms.value && locale.value !== 'en' ? t(key, {}, { locale: 'en' }) : t(key);

  /** Address of the table server on this computer; empty means the default. */
  const tableServerChoice = computed({
    get: () => storedTableServer.value,
    set: (value: string) => {
      storedTableServer.value = value.trim();
      write(TABLE_SERVER_KEY, value.trim());
    },
  });

  const tableServer = computed(() =>
    (storedTableServer.value || DEFAULT_TABLE_SERVER).replace(/\/+$/, ''),
  );

  return {
    englishTerms,
    adventureLanguageChoice,
    adventureLanguage,
    termsLanguage,
    term,
    tableServerChoice,
    tableServer,
    joinCode: computed(() => joinCode.value),
  };
}
