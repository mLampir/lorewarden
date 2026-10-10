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
  let raw: unknown;
  try {
    raw = JSON.parse(json);
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
