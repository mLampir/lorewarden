import { type AiSettings, createJoinCode, JoinCode } from '@lorewarden/core';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { i18n } from '../i18n';

const TERMS_KEY = 'lorewarden.englishTerms';
const LANGUAGE_KEY = 'lorewarden.adventureLanguage';
const JOIN_CODE_KEY = 'lorewarden.joinCode';
const ROLL_ON_START_KEY = 'lorewarden.rollInitiativeOnStart';
const SHARE_ROLLS_KEY = 'lorewarden.shareInitiativeRolls';

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
const storedRollOnStart = ref(read(ROLL_ON_START_KEY) !== 'false');
const storedShareRolls = ref(read(SHARE_ROLLS_KEY) === 'true');

/** The code players need to join. It stays the same across adventures until it is renewed. */
const joinCode = ref(read(JOIN_CODE_KEY) ?? '');
if (!JoinCode.safeParse(joinCode.value).success) renewJoinCode();

/** Gives the table a new join code. Phones with the old code have to scan the QR code again. */
export function renewJoinCode() {
  joinCode.value = createJoinCode();
  write(JOIN_CODE_KEY, joinCode.value);
}

/** Languages for new adventures, also outside components, e.g. for AI assistants. */
export function adventureLanguages(): AiSettings {
  const language = storedLanguage.value || i18n.global.locale.value;
  return storedTerms.value && language !== 'en' ? { language, termsLanguage: 'en' } : { language };
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

  /** Rolls initiative for monsters and NPCs when combat starts. On by default. */
  const rollInitiativeOnStart = computed({
    get: () => storedRollOnStart.value,
    set: (value: boolean) => {
      storedRollOnStart.value = value;
      write(ROLL_ON_START_KEY, String(value));
    },
  });

  /** Monsters of the same kind share one initiative roll. Off by default. */
  const shareInitiativeRolls = computed({
    get: () => storedShareRolls.value,
    set: (value: boolean) => {
      storedShareRolls.value = value;
      write(SHARE_ROLLS_KEY, String(value));
    },
  });

  /** Language tag new adventures are written in. */
  const adventureLanguage = computed(() => adventureLanguages().language ?? locale.value);

  /** Language tag of rules terms in new adventures, if it differs from their text. */
  const termsLanguage = computed(() => adventureLanguages().termsLanguage);

  /** Translates a rules term in the interface, in English when the setting is on. */
  const term = (key: string) =>
    storedTerms.value && locale.value !== 'en' ? t(key, {}, { locale: 'en' }) : t(key);

  return {
    englishTerms,
    adventureLanguageChoice,
    adventureLanguage,
    termsLanguage,
    term,
    rollInitiativeOnStart,
    shareInitiativeRolls,
    joinCode: computed(() => joinCode.value),
  };
}
