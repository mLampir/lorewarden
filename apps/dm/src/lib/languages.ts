/** Languages offered for the adventure text. The interface itself is translated into fewer. */
const ADVENTURE_LANGUAGES = [
  'cs',
  'da',
  'de',
  'en',
  'es',
  'fi',
  'fr',
  'hu',
  'it',
  'ja',
  'ko',
  'nb',
  'nl',
  'pl',
  'pt',
  'sv',
  'tr',
  'uk',
  'zh',
];

export interface LanguageOption {
  tag: string;
  name: string;
}

/**
 * Languages to choose from, named in the interface language and sorted by name. A tag that is not
 * in the list, e.g. from an imported adventure, is kept as an option.
 */
export function languageOptions(locale: string, current?: string): LanguageOption[] {
  const tags =
    current && !ADVENTURE_LANGUAGES.includes(current)
      ? [...ADVENTURE_LANGUAGES, current]
      : ADVENTURE_LANGUAGES;
  let names: Intl.DisplayNames | undefined;
  try {
    names = new Intl.DisplayNames([locale], { type: 'language' });
  } catch {
    // Without display names the tags themselves are shown.
  }
  return tags
    .map((tag) => ({ tag, name: nameOf(names, tag) }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}

function nameOf(names: Intl.DisplayNames | undefined, tag: string): string {
  try {
    return names?.of(tag) ?? tag;
  } catch {
    return tag;
  }
}
