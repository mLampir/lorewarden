/**
 * Combines edits made here with a change saved elsewhere meanwhile (an AI assistant, a phone,
 * another tab), both starting from the same saved version. What only one side changed is taken
 * from that side. Lists of entries with an id (scenes, NPCs, …) are combined entry by entry, so
 * an NPC added here and a scene the AI changed both stay.
 *
 * Where both sides changed the same field in different ways, the version saved elsewhere wins
 * and conflict is true, so the game master can be told to check the last edit.
 */
export function mergeChanges<T>(base: T, local: T, remote: T): { value: T; conflict: boolean } {
  let conflict = false;

  function merge(b: unknown, l: unknown, r: unknown): unknown {
    if (same(l, b)) return r;
    if (same(r, b) || same(l, r)) return l;
    if (isRecord(b) && isRecord(l) && isRecord(r)) return mergeRecords(b, l, r);
    if (isEntryList(b) && isEntryList(l) && isEntryList(r)) return mergeEntries(b, l, r);
    conflict = true;
    return r;
  }

  function mergeRecords(
    b: Record<string, unknown>,
    l: Record<string, unknown>,
    r: Record<string, unknown>,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const key of new Set([...Object.keys(r), ...Object.keys(l)])) {
      const value = merge(b[key], l[key], r[key]);
      if (value !== undefined) result[key] = value;
    }
    return result;
  }

  /** Entries in the order saved elsewhere; entries added here follow the one before them. */
  function mergeEntries(b: Entry[], l: Entry[], r: Entry[]): Entry[] {
    const inBase = byId(b);
    const inLocal = byId(l);
    const inRemote = byId(r);
    const result: Entry[] = [];
    for (const entry of r) {
      const before = inBase.get(entry.id);
      const here = inLocal.get(entry.id);
      if (here) {
        result.push(merge(before, here, entry) as Entry);
      } else if (!before) {
        result.push(entry); // Added elsewhere.
      } else if (!same(before, entry)) {
        // Removed here but changed elsewhere: kept, the game master may remove it again.
        conflict = true;
        result.push(entry);
      }
    }
    l.forEach((entry, index) => {
      if (inRemote.has(entry.id)) return;
      const before = inBase.get(entry.id);
      if (before) {
        // Removed elsewhere; changed here too, it is gone all the same.
        if (!same(before, entry)) conflict = true;
        return;
      }
      // Added here: placed after the entry it follows here.
      const previous = l[index - 1];
      const at = previous ? result.findIndex((e) => e.id === previous.id) : -1;
      result.splice(at + 1, 0, entry);
    });
    return result;
  }

  const value = merge(base, local, remote) as T;
  return { value, conflict };
}

interface Entry {
  id: string;
  [key: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEntryList(value: unknown): value is Entry[] {
  if (!Array.isArray(value)) return false;
  const ids = new Set<string>();
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || ids.has(entry.id)) return false;
    ids.add(entry.id);
  }
  return true;
}

function byId(entries: Entry[]): Map<string, Entry> {
  return new Map(entries.map((entry) => [entry.id, entry]));
}

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}
