import { type Rule, srdRules } from '@lorewarden/content';
import { splitLinks } from './links';
import type { Adventure, ContentSource, Item, Npc } from './model';
import { monsterStatBlock, resolvePoolMonster, type StatBlock, srdMonsters } from './monsters';

export { findSrdRule, type Rule, srdRules } from '@lorewarden/content';

/** What a word in adventure text can point to. */
export type TermTarget =
  | { kind: 'rule'; rule: Rule }
  /** source is set for the adventure's own monsters, as in StatBlockView. */
  | { kind: 'monster'; statBlock: StatBlock; source?: ContentSource }
  /** Linked by hand or by the AI, see links.ts. */
  | { kind: 'npc'; npc: Npc }
  | { kind: 'item'; item: Item };

/** A piece of text, with what it points to if it is a rules term, a creature or a link. */
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

export interface TermIndex {
  /** Exact spellings, matched with their case. */
  exact: Map<string, TermTarget>;
  /** Names of the adventure's own creatures, matched in any case. */
  anyCase: Map<string, TermTarget>;
  pattern: RegExp | undefined;
  /** NPCs and items by id, for the links in the text. */
  links: Map<string, TermTarget>;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Collects the words that point to a rule or a stat block: the rules glossary of the SRD 5.2.1,
 * the SRD monsters as printed, and the creatures of the adventure in any case. Creatures of the
 * adventure win over rules and SRD monsters of the same name.
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
  const links = new Map<string, TermTarget>();
  for (const npc of adventure?.npcs ?? []) links.set(npc.id, { kind: 'npc', npc });
  for (const item of adventure?.items ?? []) links.set(item.id, { kind: 'item', item });
  return { exact, anyCase, pattern, links };
}

/**
 * Splits text into plain pieces, links to NPCs and items, and the words that point to a rule or a
 * stat block. A link to an NPC or item the adventure does not have shows its words only.
 */
export function linkTerms(text: string, index: TermIndex): TextSegment[] {
  return splitLinks(text).flatMap((span) => {
    if (span.id === undefined) return findTerms(span.text, index);
    const target = index.links.get(span.id);
    return [target ? { text: span.text, target } : { text: span.text }];
  });
}

function findTerms(text: string, index: TermIndex): TextSegment[] {
  const segments: TextSegment[] = [];
  if (!index.pattern) return [{ text }];
  let last = 0;
  for (const match of text.matchAll(index.pattern)) {
    const word = match[0];
    const base = match[1] ?? word;
    const plural = word !== base;
    const own = index.anyCase.get(base.toLowerCase());
    const printed = index.exact.get(base);
    // Rules terms are matched only as printed, and only creatures can be plural.
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
