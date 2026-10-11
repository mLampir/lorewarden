import { z } from 'zod';
import { checkIntegrity, type IntegrityProblem } from './integrity';
import { Adventure, type Monster } from './model';
import { withLibraryMonsters } from './monsters';

export const ADVENTURE_FILE_FORMAT = 'lorewarden.adventure';
export const ADVENTURE_FILE_VERSION = 1;

const AdventureFile = z.object({
  format: z.literal(ADVENTURE_FILE_FORMAT),
  version: z.literal(ADVENTURE_FILE_VERSION),
  exportedAt: z.iso.datetime(),
  adventure: Adventure,
});

export type AdventureFile = z.infer<typeof AdventureFile>;

export type ParseResult =
  | { ok: true; adventure: Adventure }
  | { ok: false; problems: IntegrityProblem[] };

export function serializeAdventure(adventure: Adventure, now: Date = new Date()): string {
  const file: AdventureFile = {
    format: ADVENTURE_FILE_FORMAT,
    version: ADVENTURE_FILE_VERSION,
    exportedAt: now.toISOString(),
    adventure,
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

/**
 * Parses an exported adventure file, checking both its shape and its internal references.
 * Monsters of the game master's library that the monster pool uses are copied into the adventure.
 */
export function parseAdventure(json: string, library: readonly Monster[] = []): ParseResult {
  return parseWith(json, (raw) => raw, library);
}

/**
 * Parses an adventure file an AI assistant adapted from the given adventure. The id and the asset
 * data come from the original, because the instructions for the AI leave the asset data out.
 */
export function parseAdaptedAdventure(
  original: Adventure,
  json: string,
  library: readonly Monster[] = [],
): ParseResult {
  return parseWith(
    json,
    (raw) => {
      if (!isRecord(raw) || !isRecord(raw.adventure)) return raw;
      return { ...raw, adventure: { ...raw.adventure, id: original.id, assets: original.assets } };
    },
    library,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseWith(
  json: string,
  prepare: (raw: unknown) => unknown,
  library: readonly Monster[],
): ParseResult {
  let raw: unknown;
  try {
    raw = prepare(JSON.parse(json));
  } catch (error) {
    return {
      ok: false,
      problems: [{ path: '', message: `Invalid JSON: ${(error as Error).message}` }],
    };
  }

  const parsed = AdventureFile.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    };
  }

  const adventure = withLibraryMonsters(parsed.data.adventure, library);
  const problems = checkIntegrity(adventure);
  return problems.length > 0 ? { ok: false, problems } : { ok: true, adventure };
}
