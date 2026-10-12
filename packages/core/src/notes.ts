/** A run of text in a note, bold when it was written between double asterisks. */
export interface NoteSpan {
  text: string;
  bold?: true;
}

/** A paragraph or a bullet list of a note; each line of a paragraph or each bullet is a list of spans. */
export type NoteBlock =
  | { kind: 'paragraph'; lines: NoteSpan[][] }
  | { kind: 'list'; items: NoteSpan[][] };

const BULLET = /^\s*[-*•]\s+/;

/**
 * Reads the small Markdown subset Lorewarden allows in notes, so the game master can scan them at
 * the table: lines starting with "- " are bullet points and **double asterisks** mark key words.
 * Everything else, HTML included, stays plain text.
 */
export function parseNotes(text: string): NoteBlock[] {
  const blocks: NoteBlock[] = [];
  for (const line of text.split(/\r?\n/)) {
    const last = blocks.at(-1);
    if (line.trim() === '') {
      // An empty line ends a paragraph; the next text starts a new one.
      if (last?.kind === 'paragraph') blocks.push({ kind: 'paragraph', lines: [] });
      continue;
    }
    if (BULLET.test(line)) {
      const item = parseBold(line.replace(BULLET, ''));
      if (last?.kind === 'list') last.items.push(item);
      else blocks.push({ kind: 'list', items: [item] });
    } else if (last?.kind === 'paragraph') {
      last.lines.push(parseBold(line));
    } else {
      blocks.push({ kind: 'paragraph', lines: [parseBold(line)] });
    }
  }
  return blocks.filter((block) => block.kind === 'list' || block.lines.length > 0);
}

const BOLD = /\*\*(\S(?:.*?\S)??)\*\*/g;

/** Splits a line at **bold** words; like Markdown, "**" next to a space does not count. */
export function parseBold(line: string): NoteSpan[] {
  const spans: NoteSpan[] = [];
  let last = 0;
  for (const match of line.matchAll(BOLD)) {
    if (match.index > last) spans.push({ text: line.slice(last, match.index) });
    spans.push({ text: match[1] ?? '', bold: true });
    last = match.index + match[0].length;
  }
  if (last < line.length || spans.length === 0) spans.push({ text: line.slice(last) });
  return spans;
}
