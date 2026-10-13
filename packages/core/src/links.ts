import type { Adventure } from './model';

/**
 * A link from adventure text to an NPC or item, written like a Markdown link with the id as
 * target: "At the bar stands [a tall woman](npc-bertha)." Only the words in brackets are shown.
 * Any id of letters, digits, "_", "-" and "." counts, also one without the usual "npc-" or
 * "item-", e.g. from a file an AI wrote: a link whose id is not an NPC or item shows its words
 * and is reported by `brokenLinks`. Web addresses hold ":" or "/" and stay as they are.
 */
const LINK = /\[([^[\]\n]+)\]\(([\p{L}\p{N}_.-]+)\)/gu;

/** A piece of text, with the id of the NPC or item it links to. */
export interface LinkSpan {
  text: string;
  id?: string;
}

/** Splits text into plain pieces and linked words. */
export function splitLinks(text: string): LinkSpan[] {
  const spans: LinkSpan[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK)) {
    if (match.index > last) spans.push({ text: text.slice(last, match.index) });
    spans.push({ text: match[1] ?? '', id: match[2] ?? '' });
    last = match.index + match[0].length;
  }
  if (last < text.length || spans.length === 0) spans.push({ text: text.slice(last) });
  return spans;
}

/** The text as players and printouts see it: links become their words. */
export function stripLinks(text: string): string {
  return text.replace(LINK, '$1');
}

/** The texts of an adventure that may hold links. */
export function linkableTexts(adventure: Adventure): string[] {
  return [
    adventure.summary,
    ...adventure.scenes.flatMap((s) => [
      s.purpose,
      ...s.features,
      s.wayOut,
      s.description,
      s.notes,
      ...s.exits.map((e) => e.condition ?? ''),
    ]),
    ...adventure.npcs.flatMap((n) => [n.description, n.notes]),
    ...adventure.items.flatMap((i) => [i.description, i.notes]),
    ...adventure.clues.flatMap((c) => [c.text, c.notes, ...c.leads.map((l) => l.text)]),
    ...adventure.puzzles.flatMap((p) => [p.prompt, p.solution, ...p.hints.map((h) => h.text)]),
  ];
}

/** Links whose NPC or item the adventure does not have (any more), with their words. */
export function brokenLinks(adventure: Adventure): LinkSpan[] {
  const ids = new Set([...adventure.npcs, ...adventure.items].map((entry) => entry.id));
  return linkableTexts(adventure)
    .flatMap(splitLinks)
    .filter((span) => span.id !== undefined && !ids.has(span.id));
}
