import { z } from 'zod';
import { type FileFormat, isRawFile, upgradeFile } from './file-format';
import { checkIntegrity, type IntegrityProblem } from './integrity';
import { Adventure, type Monster } from './model';
import { withLibraryMonsters } from './monsters';

export const ADVENTURE_FILE_FORMAT = 'lorewarden.adventure';
export const ADVENTURE_FILE_VERSION = 1;

/** Adventure files: one adventure with everything it needs, as the app exports it. */
export const ADVENTURE_FILE: FileFormat = {
  format: ADVENTURE_FILE_FORMAT,
  version: ADVENTURE_FILE_VERSION,
  migrations: {},
  wrongFormat: 'Not a Lorewarden adventure file',
};

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
  return parseWith(json, { library });
}

/**
 * Reads an adventure file kept in the adventure folder. It checks the shape only, like the app's
 * own storage: an adventure the game master is still editing may point to a scene that is not
 * there yet, and must not vanish.
 */
export function readAdventureFile(json: string): ParseResult {
  return parseWith(json, { integrity: false });
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
  return parseWith(json, {
    library,
    prepare: (raw) => {
      if (!isRawFile(raw.adventure)) return raw;
      // The link to the game master's party stays, even if the AI leaves it out.
      const party = isRawFile(raw.adventure.party)
        ? {
            ...raw.adventure.party,
            ...(original.party.partyId ? { partyId: original.party.partyId } : {}),
            ...(original.party.levels ? { levels: original.party.levels } : {}),
          }
        : raw.adventure.party;
      return {
        ...raw,
        adventure: { ...raw.adventure, id: original.id, assets: original.assets, party },
      };
    },
  });
}

interface ParseOptions {
  /** Monsters of the game master's library, copied into the adventure where its pool uses them. */
  library?: readonly Monster[];
  /** Changes the file after it was brought to the current version and before it is checked. */
  prepare?: (raw: Record<string, unknown>) => unknown;
  /** Also checks the references between entries. On unless turned off. */
  integrity?: boolean;
}

function parseWith(
  json: string,
  { library = [], prepare = (raw) => raw, integrity = true }: ParseOptions,
): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (error) {
    return {
      ok: false,
      problems: [{ path: '', message: `Invalid JSON: ${(error as Error).message}` }],
    };
  }

  const upgraded = upgradeFile(raw, ADVENTURE_FILE);
  if (!upgraded.ok) {
    return { ok: false, problems: [{ path: '', message: upgraded.problem }] };
  }

  const parsed = AdventureFile.safeParse(prepare(upgraded.file));
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    };
  }

  if (!integrity) return { ok: true, adventure: parsed.data.adventure };
  const adventure = withLibraryMonsters(parsed.data.adventure, library);
  const problems = checkIntegrity(adventure);
  return problems.length > 0 ? { ok: false, problems } : { ok: true, adventure };
}
