import { z } from 'zod';
import { checkIntegrity, type IntegrityProblem } from './integrity';
import { Adventure } from './model';

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

/** Parses an exported adventure file, checking both its shape and its internal references. */
export function parseAdventure(json: string): ParseResult {
  return parseWith(json, (raw) => raw);
}

/**
 * Parses an adventure file an AI assistant adapted from the given adventure. The id and the asset
 * data come from the original, because the instructions for the AI leave the asset data out.
 */
export function parseAdaptedAdventure(original: Adventure, json: string): ParseResult {
  return parseWith(json, (raw) => {
    if (!isRecord(raw) || !isRecord(raw.adventure)) return raw;
    return { ...raw, adventure: { ...raw.adventure, id: original.id, assets: original.assets } };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseWith(json: string, prepare: (raw: unknown) => unknown): ParseResult {
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

  const problems = checkIntegrity(parsed.data.adventure);
  return problems.length > 0
    ? { ok: false, problems }
    : { ok: true, adventure: parsed.data.adventure };
}
