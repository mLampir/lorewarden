import { builtinRandomTables } from '@lorewarden/content';
import { createId } from './ids';
import type { Adventure, RandomTable, RandomTableEntry, Session } from './model';

export function createRandomTable(title: string): RandomTable {
  return { id: createId('table'), title, noRepeat: false, entries: [] };
}

/** Copies a table under a new id, e.g. a built-in table into an adventure to change it there. */
export function copyRandomTable(table: RandomTable): RandomTable {
  return {
    ...table,
    id: createId('table'),
    entries: table.entries.map((entry) => ({ ...entry })),
  };
}

/** The tables that come with Lorewarden, in German for "de…" and in English for anything else. */
export function builtinTables(language = 'en'): RandomTable[] {
  const lang = language.toLowerCase().startsWith('de') ? 'de' : 'en';
  return builtinRandomTables.map((table) => ({
    id: table.id,
    title: table.title[lang],
    noRepeat: table.noRepeat ?? false,
    entries: table.entries.map((entry) => ({ text: entry[lang], weight: entry.weight ?? 1 })),
  }));
}

/** A line of a table with the numbers of the die it takes, e.g. 4 to 6. */
export interface TableRow {
  entry: RandomTableEntry;
  index: number;
  from: number;
  to: number;
}

/** The lines of a table with their numbers, counting from 1. */
export function tableRows(table: RandomTable): TableRow[] {
  let next = 1;
  return table.entries.map((entry, index) => {
    const from = next;
    next += entry.weight;
    return { entry, index, from, to: next - 1 };
  });
}

/** How many sides the die of a table has: its weights added up. */
export function tableDie(table: RandomTable): number {
  return table.entries.reduce((sum, entry) => sum + entry.weight, 0);
}

/** The numbers of a row as printed in a table, e.g. "4–6" or "7". */
export function rowRange(row: Pick<TableRow, 'from' | 'to'>): string {
  return row.from === row.to ? String(row.from) : `${row.from}–${row.to}`;
}

export interface TableRoll {
  tableId: string;
  /** The number rolled on the table's die. */
  roll: number;
  entry: RandomTableEntry;
  /** Every result of a table without repeats had come up, so it started over. */
  reset: boolean;
}

/**
 * Rolls on a table. A table without repeats skips the texts in `rolled`, as if it rolled again
 * until it hits a new one; once all have come up, it starts over. Undefined for an empty table.
 */
export function rollOnTable(
  table: RandomTable,
  rolled: readonly string[] = [],
  random: () => number = Math.random,
): TableRoll | undefined {
  const rows = tableRows(table);
  const fresh = table.noRepeat ? rows.filter((row) => !rolled.includes(row.entry.text)) : rows;
  const reset = fresh.length === 0 && rows.length > 0;
  const candidates = reset ? rows : fresh;
  const total = candidates.reduce((sum, row) => sum + row.entry.weight, 0);
  if (total === 0) return undefined;
  let pick = Math.floor(random() * total);
  for (const row of candidates) {
    if (pick < row.entry.weight) {
      return { tableId: table.id, roll: row.from + pick, entry: row.entry, reset };
    }
    pick -= row.entry.weight;
  }
  return undefined;
}

/** The texts already rolled on a table in this session, for tables without repeats. */
export function rolledTexts(session: Session, tableId: string): string[] {
  return session.tableRolls[tableId] ?? [];
}

/** Rolls on a table and remembers the result in the session when the table must not repeat. */
export function rollInSession(
  session: Session,
  table: RandomTable,
  random: () => number = Math.random,
): { session: Session; roll?: TableRoll } {
  const roll = rollOnTable(table, rolledTexts(session, table.id), random);
  if (!roll || !table.noRepeat) return { session, roll };
  const before = roll.reset ? [] : rolledTexts(session, table.id);
  return {
    session: {
      ...session,
      tableRolls: { ...session.tableRolls, [table.id]: [...before, roll.entry.text] },
    },
    roll,
  };
}

export function removeRandomTable(adventure: Adventure, tableId: string): Adventure {
  return {
    ...adventure,
    randomTables: adventure.randomTables.filter((table) => table.id !== tableId),
  };
}

/**
 * Turns lines of text into entries, one per line, e.g. pasted from a document. Numbers in front
 * followed by ".", ":", ")", "|" or a tab, such as "4–6." or "7:", set the weight; bullets are
 * dropped. Without such a mark a number stays part of the text, e.g. "2 wolves".
 */
export function entriesFromLines(text: string): RandomTableEntry[] {
  return text.split(/\r?\n/).flatMap((line) => {
    // Plain spaces and the separator never overlap, so the patterns run in linear time.
    const rest = line.trim().replace(/^[-*•] */, '');
    const numbers = /^(\d+)(?: *[-–] *(\d+))? *(?:\t|[.:)|](?=\s|$))/.exec(rest);
    const words = (numbers ? rest.slice(numbers[0].length) : rest).trim();
    if (!words) return [];
    const from = Number(numbers?.[1]);
    const to = Number(numbers?.[2] ?? numbers?.[1]);
    const weight = numbers && to >= from ? Math.min(to - from + 1, 100) : 1;
    return [{ text: words, weight }];
  });
}
