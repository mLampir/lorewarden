import { z } from 'zod';

// The game master's own files next to the adventures, such as the monster library and the
// parties: a format, a version and one list of entries.

export interface LibraryFormat<T> {
  format: string;
  version: number;
  /** Key of the list in the file, e.g. "monsters". */
  key: string;
  /** Schema of one entry. */
  entry: z.ZodType<T>;
  /** Problem when the file is not of this format, e.g. "Not a Lorewarden party file". */
  wrongFormat: string;
}

/** Writes the entries sorted by name, so the file changes little between saves. */
export function serializeLibrary<T extends { name: string }>(
  library: LibraryFormat<T>,
  entries: readonly T[],
): string {
  const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));
  const file = { format: library.format, version: library.version, [library.key]: sorted };
  return `${JSON.stringify(file, null, 2)}\n`;
}

/**
 * Reads a library file. A single broken entry is skipped and reported, so one typo in a
 * hand-edited file does not hide the whole library.
 */
export function parseLibrary<T>(
  library: LibraryFormat<T>,
  text: string,
): { entries: T[]; problems: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { entries: [], problems: [`Invalid JSON: ${(error as Error).message}`] };
  }
  const file = z
    .object({
      format: z.literal(library.format),
      version: z.literal(library.version),
      [library.key]: z.array(z.unknown()).default([]),
    })
    .safeParse(raw);
  if (!file.success) return { entries: [], problems: [library.wrongFormat] };
  const entries: T[] = [];
  const problems: string[] = [];
  for (const [i, entry] of (file.data[library.key] as unknown[]).entries()) {
    const parsed = library.entry.safeParse(entry);
    if (parsed.success) entries.push(parsed.data);
    else {
      const issue = parsed.error.issues[0];
      problems.push(`${library.key}[${i}].${issue?.path.map(String).join('.')}: ${issue?.message}`);
    }
  }
  return { entries, problems };
}

/** Replaces the entry with the same id, or adds it at the end. */
export function upsertById<T extends { id: string }>(list: readonly T[], entry: T): T[] {
  const index = list.findIndex((other) => other.id === entry.id);
  if (index < 0) return [...list, entry];
  return list.map((other, i) => (i === index ? entry : other));
}

/** Adds the id to the list, or takes it out if it is there. */
export function toggleId(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id];
}
