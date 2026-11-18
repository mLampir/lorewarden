/** The kinds of results of the quick search, in the order their groups show on a tie. */
export const SEARCH_GROUPS = ['scenes', 'npcs', 'items', 'monsters', 'rules'] as const;
export type SearchGroup = (typeof SEARCH_GROUPS)[number];

/** Something the quick search can find. */
export interface SearchEntry<T> {
  /** Unique among all entries, e.g. "npc:npc-bertha". */
  key: string;
  group: SearchGroup;
  name: string;
  /** Shown after the name, e.g. an NPC's role or a monster's challenge rating. */
  detail?: string;
  /** Other names it is found by, e.g. "AC" for Armor Class or the German name of a condition. */
  aliases?: string[];
  /** Longer text it is also found by, with a lower rank, e.g. what an NPC looks like. */
  text?: string;
  /** Ranks the adventure's own entries above library and SRD entries that match as well. */
  boost?: number;
  target: T;
}

export interface SearchGroupResult<T> {
  group: SearchGroup;
  entries: SearchEntry<T>[];
}

/** Lower case without accents, so "Grün" is found with "grun" and "Mephit" with "méphit". */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

const WORD = /[\p{L}\p{N}]/u;

/** Where the words of a normalized text start. */
function wordStarts(text: string): Set<number> {
  const starts = new Set<number>();
  for (let i = 0; i < text.length; i++) {
    if (WORD.test(text.charAt(i)) && (i === 0 || !WORD.test(text.charAt(i - 1)))) starts.add(i);
  }
  return starts;
}

/**
 * Finds the letters of the query in order, starting at the beginning of a word, e.g. "gbb" in
 * "Goblin Boss". Returns how many letters lie between them, or undefined if they are not there.
 */
function gapsInOrder(query: string, text: string, starts: Set<number>): number | undefined {
  let best: number | undefined;
  for (const start of starts) {
    if (text.charAt(start) !== query.charAt(0)) continue;
    let at = start;
    let gaps = 0;
    let found = true;
    for (const char of query.slice(1)) {
      if (char === ' ') continue;
      const next = text.indexOf(char, at + 1);
      if (next === -1) {
        found = false;
        break;
      }
      gaps += next - at - 1;
      at = next;
    }
    if (found && (best === undefined || gaps < best)) best = gaps;
  }
  return best;
}

/**
 * How well a normalized query matches a normalized name, from 100 for the same name down to a
 * few points for letters found in order; undefined when it does not match at all. Each word of
 * the query may also match the start of any word, so "boss gob" finds "Goblin Boss".
 */
export function matchScore(query: string, name: string): number | undefined {
  if (query === '' || name === '') return undefined;
  if (name === query) return 100;
  if (name.startsWith(query)) return 90;
  const starts = wordStarts(name);
  const at = name.indexOf(query);
  if (at !== -1) return starts.has(at) ? 80 : 60;
  const words = query.split(' ');
  if (
    words.length > 1 &&
    words.every((word) => [...starts].some((start) => name.startsWith(word, start)))
  ) {
    return 55;
  }
  if (query.length < 2) return undefined;
  // Letters far apart would find almost anything, e.g. "gob" in "Gelatinous Cube".
  const gaps = gapsInOrder(query, name, starts);
  return gaps === undefined || gaps > query.length * 2 ? undefined : 40 - gaps * 2;
}

interface Prepared<T> {
  entry: SearchEntry<T>;
  name: string;
  aliases: string[];
  text: string;
  order: number;
}

/**
 * Builds a search over the entries: their names, other names and longer text are prepared once,
 * so typing stays quick with the whole SRD in it.
 */
export function createSearch<T>(entries: readonly SearchEntry<T>[]) {
  const prepared: Prepared<T>[] = entries.map((entry, order) => ({
    entry,
    name: normalize(entry.name),
    aliases: (entry.aliases ?? []).map(normalize),
    text: normalize(entry.text ?? ''),
    order,
  }));

  function score(item: Prepared<T>, query: string): number | undefined {
    let best = matchScore(query, item.name);
    for (const alias of item.aliases) {
      const value = matchScore(query, alias);
      if (value !== undefined && (best === undefined || value - 5 > best)) best = value - 5;
    }
    // Longer text only counts for whole words of three letters or more, or it finds everything.
    if (best === undefined && query.length >= 3 && item.text.includes(query)) {
      const at = item.text.indexOf(query);
      if (at === 0 || !WORD.test(item.text.charAt(at - 1))) best = 20;
    }
    return best === undefined ? undefined : best + (item.entry.boost ?? 0);
  }

  /**
   * The best matches for the query, grouped by kind, at most `perGroup` per group. The group with
   * the best match comes first.
   */
  function search(text: string, perGroup = 6): SearchGroupResult<T>[] {
    const query = normalize(text);
    if (query === '') return [];
    const scored = prepared.flatMap((item) => {
      const value = score(item, query);
      return value === undefined ? [] : [{ item, value }];
    });
    scored.sort(
      (a, b) =>
        b.value - a.value || a.item.name.length - b.item.name.length || a.item.order - b.item.order,
    );
    const groups = new Map<SearchGroup, { best: number; entries: SearchEntry<T>[] }>();
    for (const { item, value } of scored) {
      const group = groups.get(item.entry.group) ?? { best: value, entries: [] };
      groups.set(item.entry.group, group);
      if (group.entries.length < perGroup) group.entries.push(item.entry);
    }
    return [...groups.entries()]
      .sort(
        ([a, x], [b, y]) => y.best - x.best || SEARCH_GROUPS.indexOf(a) - SEARCH_GROUPS.indexOf(b),
      )
      .map(([group, { entries }]) => ({ group, entries }));
  }

  return { search };
}
