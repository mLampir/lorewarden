// Every file Lorewarden keeps names its format and the version of that format. A file of an older
// version is brought up to date step by step before its schema reads it, so a change to the file
// format never makes older files unreadable. A file of a newer version is not read: saving it
// again would drop what the newer Lorewarden added.

/** A file as JSON, before its schema reads it. */
export type RawFile = Record<string, unknown>;

/**
 * Steps that bring a file to the next version: steps[1] turns a version 1 file into version 2.
 * A step sees the file as stored and returns it in the shape of the next version, without the
 * version field, which is set for it. When the version of a format goes up, add the step for the
 * version before it and keep a file of that version in packages/core/test/fixtures.
 */
export type Migrations = Readonly<Record<number, (file: RawFile) => RawFile>>;

export interface FileFormat {
  format: string;
  /** The version this Lorewarden writes. */
  version: number;
  migrations: Migrations;
  /** Problem when the file is not of this format, e.g. "Not a Lorewarden party file". */
  wrongFormat: string;
}

export type UpgradeResult = { ok: true; file: RawFile } | { ok: false; problem: string };

/**
 * Checks the format and version of a file and brings it to the current version. Every version
 * from 1 to the current one is read.
 */
export function upgradeFile(raw: unknown, format: FileFormat): UpgradeResult {
  if (!isRawFile(raw) || raw.format !== format.format) {
    return { ok: false, problem: format.wrongFormat };
  }
  const { version } = raw;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, problem: `Unknown file version ${JSON.stringify(version)}` };
  }
  if (version > format.version) {
    return {
      ok: false,
      problem: `Made with a newer Lorewarden (file version ${version}); update Lorewarden to open it`,
    };
  }
  let file = raw;
  for (let from = version; from < format.version; from++) {
    const step = format.migrations[from];
    if (!step) throw new Error(`${format.format} has no step from version ${from}`);
    file = { ...step(file), version: from + 1 };
  }
  return { ok: true, file };
}

export function isRawFile(value: unknown): value is RawFile {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
