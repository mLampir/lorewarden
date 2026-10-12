import { type Rule, srdRules } from '@lorewarden/content';
import type { Adventure, ContentSource, Item, Npc } from './model';
import { monsterStatBlock, resolvePoolMonster, type StatBlock, srdMonsters } from './monsters';

export { findSrdRule, type Rule, srdRules } from '@lorewarden/content';

/** What a word in adventure text can point to. */
export type TermTarget =
  | { kind: 'rule'; rule: Rule }
  /** source is set for the adventure's own monsters, as in StatBlockView. */
  | { kind: 'monster'; statBlock: StatBlock; source?: ContentSource }
  | { kind: 'npc'; npc: Npc }
  | { kind: 'item'; item: Item };

/** A piece of text, with what it points to if it is a rules term or a name. */
export interface TextSegment {
  text: string;
  target?: TermTarget;
}

/**
 * Glossary entries whose names are everyday words in adventure text, such as "Search the room"
 * or "Help arrives", so marking them would mostly be noise.
 */
const COMMON_WORDS = new Set([
  'Action',
  'Adventure',
  'Ally',
  'Attack',
  'Attitude',
  'Campaign',
  'Character Sheet',
  'Climbing',
  'Condition',
  'Crawling',
  'Creature',
  'Curses',
  'Damage',
  'Dash',
  'Dead',
  'Encounter',
  'Enemy',
  'Flying',
  'Hazard',
  'Healing',
  'Help',
  'Hide',
  'Hover',
  'Illusions',
  'Influence',
  'Jumping',
  'Magic',
  'Monster',
  'Object',
  'Per Day',
  'Player Character',
  'Nonplayer Character',
  'Possession',
  'Ready',
  'Reach',
  'Round Down',
  'Save',
  'Search',
  'Simultaneous Effects',
  'Size',
  'Skill',
  'Speed',
  'Spell',
  'Stable',
  'Study',
  'Surprise',
  'Swimming',
  'Target',
  'Telepathy',
  'Teleportation',
  'Utilize',
  'Weapon',
]);

/** Other ways the rules write a glossary term. */
const ALIASES: Record<string, string[]> = {
  'Armor Class': ['AC'],
  'Challenge Rating': ['CR'],
  'Difficulty Class': ['DC'],
  'Experience Points': ['XP'],
  'Hit Points': ['HP', 'Hit Point'],
  'Opportunity Attacks': ['Opportunity Attack'],
  'Saving Throw': ['Saving Throws', 'saving throw', 'saving throws'],
  'Death Saving Throw': ['Death Saving Throws'],
  'Temporary Hit Points': ['Temporary Hit Point'],
  'Critical Hit': ['Critical Hits'],
};

/**
 * Words in NPC names that do not stand for the NPC on their own, such as "Old" in "Old Brannoc"
 * or "Captain" in "Captain Vera".
 */
const NAME_TITLES = new Set([
  'Alte',
  'Alter',
  'Bruder',
  'Brother',
  'Captain',
  'Das',
  'Der',
  'Die',
  'Father',
  'Frau',
  'Herr',
  'Hauptmann',
  'King',
  'Lady',
  'Lord',
  'Master',
  'Meister',
  'Mother',
  'Mutter',
  'Old',
  'Queen',
  'Schwester',
  'Sister',
  'Sir',
  'The',
  'Vater',
  'Von',
]);

/**
 * The parts of NPC names that the text may use alone, e.g. "Brannoc" for "Old Brannoc": capitalised
 * words of at least three letters that only one NPC has and that are no title.
 */
function nameParts(npcs: Npc[]): Map<string, Npc> {
  const parts = new Map<string, Npc | undefined>();
  for (const npc of npcs) {
    const words = npc.name.split(/[^\p{L}\p{N}'-]+/u).filter(Boolean);
    if (words.length < 2) continue;
    for (const word of new Set(words)) {
      if (word.length < 3 || NAME_TITLES.has(word) || !/^\p{Lu}/u.test(word)) continue;
      parts.set(word, parts.has(word) ? undefined : npc);
    }
  }
  return new Map([...parts].filter((entry): entry is [string, Npc] => entry[1] !== undefined));
}

/**
 * The last word of item names, which the text may use alone, e.g. "logbook" for "Ferry Logbook":
 * words of at least four letters that only one item ends with.
 */
function itemHeads(items: Item[]): Map<string, Item> {
  const heads = new Map<string, Item | undefined>();
  for (const item of items) {
    const words = item.name.split(/[^\p{L}\p{N}'-]+/u).filter(Boolean);
    const head = words.at(-1)?.toLowerCase();
    if (words.length < 2 || !head || head.length < 4) continue;
    heads.set(head, heads.has(head) ? undefined : item);
  }
  return new Map([...heads].filter((entry): entry is [string, Item] => entry[1] !== undefined));
}

export interface TermIndex {
  /** Exact spellings, matched with their case. */
  exact: Map<string, TermTarget>;
  /** Names of the adventure's own creatures, NPCs and items, matched in any case. */
  anyCase: Map<string, TermTarget>;
  pattern: RegExp | undefined;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Collects the words that point to a rule, a stat block, an NPC or an item: the rules glossary of
 * the SRD 5.2.1, the SRD monsters as printed, and the creatures, NPCs and items of the adventure in
 * any case. The adventure's own names win over rules and SRD monsters of the same name; its
 * creatures win over NPCs and items. Parts of NPC names count as printed, e.g. "Brannoc" for
 * "Old Brannoc", and the last word of an item name in any case, e.g. "logbook" for "Ferry
 * Logbook", unless the rules or the SRD already use the word.
 */
export function buildTermIndex(adventure?: Adventure): TermIndex {
  const exact = new Map<string, TermTarget>();
  const anyCase = new Map<string, TermTarget>();
  for (const rule of srdRules) {
    if (COMMON_WORDS.has(rule.name)) continue;
    const target: TermTarget = { kind: 'rule', rule };
    for (const name of [rule.name, ...(ALIASES[rule.name] ?? [])]) exact.set(name, target);
  }
  for (const statBlock of srdMonsters) {
    exact.set(statBlock.name, { kind: 'monster', statBlock });
  }
  for (const [part, npc] of nameParts(adventure?.npcs ?? [])) {
    if (!exact.has(part)) exact.set(part, { kind: 'npc', npc });
  }
  const printed = new Set([...exact.keys()].map((name) => name.toLowerCase()));
  for (const [head, item] of itemHeads(adventure?.items ?? [])) {
    if (!printed.has(head)) anyCase.set(head, { kind: 'item', item });
  }
  for (const item of adventure?.items ?? []) {
    anyCase.set(item.name.toLowerCase(), { kind: 'item', item });
  }
  for (const npc of adventure?.npcs ?? []) {
    anyCase.set(npc.name.toLowerCase(), { kind: 'npc', npc });
  }
  for (const monster of adventure?.monsters ?? []) {
    anyCase.set(monster.name.toLowerCase(), {
      kind: 'monster',
      statBlock: monsterStatBlock(monster),
      source: monster.source,
    });
  }
  for (const pool of adventure?.monsterPool ?? []) {
    const resolved = adventure && resolvePoolMonster(adventure, pool);
    if (!resolved?.statBlock) continue;
    const target: TermTarget = {
      kind: 'monster',
      statBlock: resolved.statBlock,
      source: resolved.base?.source,
    };
    for (const name of new Set([pool.name, resolved.name])) {
      anyCase.set(name.toLowerCase(), target);
    }
  }
  const names = [...exact.keys(), ...anyCase.keys()].sort((a, b) => b.length - a.length);
  // Creatures may be plural; letters around a match mean it is part of a longer word.
  const pattern =
    names.length > 0
      ? new RegExp(
          `(?<![\\p{L}\\p{N}])(${names.map(escapeRegExp).join('|')})(?:e?s)?(?![\\p{L}\\p{N}])`,
          'giu',
        )
      : undefined;
  return { exact, anyCase, pattern };
}

/** Splits text into plain pieces and the words that point to a rule, stat block, NPC or item. */
export function linkTerms(text: string, index: TermIndex): TextSegment[] {
  const segments: TextSegment[] = [];
  if (!index.pattern) return [{ text }];
  let last = 0;
  for (const match of text.matchAll(index.pattern)) {
    const word = match[0];
    const base = match[1] ?? word;
    const plural = word !== base;
    const own = index.anyCase.get(base.toLowerCase());
    const printed = index.exact.get(base);
    // Rules terms and NPC name parts are matched only as printed, and only creatures can be plural.
    const target = own ?? (printed?.kind === 'monster' || !plural ? printed : undefined);
    if (!target) continue;
    const at = match.index ?? 0;
    if (at > last) segments.push({ text: text.slice(last, at) });
    segments.push({ text: word, target });
    last = at + word.length;
  }
  if (last < text.length) segments.push({ text: text.slice(last) });
  return segments;
}
