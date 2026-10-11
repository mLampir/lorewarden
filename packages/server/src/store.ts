import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ADVENTURE_FILE_FORMAT, Adventure, Session, serializeAdventure } from '@lorewarden/core';

export const ADVENTURE_SUFFIX = '.adventure.json';
const SESSION_SUFFIX = '.session.json';
const SESSION_DIR = 'sessions';

export interface AdventureSummary {
  id: string;
  title: string;
  sceneCount: number;
  updatedAt: string;
}

/** A file in the folder that is not a valid adventure, so the game master can be told. */
export interface BrokenFile {
  file: string;
  problems: string[];
}

interface Entry {
  adventure: Adventure;
  file: string;
  updatedAt: string;
}

/**
 * Keeps adventures as Lorewarden adventure files in one folder, the same files the app exports
 * and imports, and the sessions played with them in a subfolder. The folder is read again for
 * every list, so files copied in by hand appear without a restart.
 */
export class Store {
  private writes = Promise.resolve();

  constructor(readonly dir: string) {}

  private async entries(): Promise<{ entries: Entry[]; broken: BrokenFile[] }> {
    await mkdir(this.dir, { recursive: true });
    const files = (await readdir(this.dir)).filter((f) => f.endsWith(ADVENTURE_SUFFIX)).sort();
    const entries: Entry[] = [];
    const broken: BrokenFile[] = [];
    for (const file of files) {
      const path = join(this.dir, file);
      const [text, info] = await Promise.all([readFile(path, 'utf8'), stat(path)]);
      const result = readAdventureFile(text);
      if (result.ok) {
        entries.push({ adventure: result.adventure, file, updatedAt: info.mtime.toISOString() });
      } else {
        broken.push({ file, problems: result.problems });
      }
    }
    return { entries, broken };
  }

  async list(): Promise<{ adventures: AdventureSummary[]; broken: BrokenFile[] }> {
    const { entries, broken } = await this.entries();
    const adventures = entries
      .map(({ adventure, updatedAt }) => ({
        id: adventure.id,
        title: adventure.title,
        sceneCount: adventure.scenes.length,
        updatedAt,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { adventures, broken };
  }

  async get(id: string): Promise<Adventure | undefined> {
    const { entries } = await this.entries();
    return entries.find((e) => e.adventure.id === id)?.adventure;
  }

  /** Saves an adventure, in its own file or in a new one named after its title. */
  async save(adventure: Adventure): Promise<void> {
    await this.serial(async () => {
      const { entries } = await this.entries();
      const file =
        entries.find((e) => e.adventure.id === adventure.id)?.file ??
        (await this.freeName(slug(adventure.title) || 'adventure', ADVENTURE_SUFFIX));
      await writeAtomic(join(this.dir, file), serializeAdventure(adventure));
    });
  }

  /** Deletes an adventure together with its sessions. Returns false if there was none. */
  async delete(id: string): Promise<boolean> {
    return this.serial(async () => {
      const { entries } = await this.entries();
      const entry = entries.find((e) => e.adventure.id === id);
      if (!entry) return false;
      await rm(join(this.dir, entry.file), { force: true });
      for (const session of await this.sessions(id)) {
        await rm(this.sessionPath(session.id), { force: true });
      }
      return true;
    });
  }

  private async sessions(adventureId: string): Promise<Session[]> {
    const dir = join(this.dir, SESSION_DIR);
    await mkdir(dir, { recursive: true });
    const files = (await readdir(dir)).filter((f) => f.endsWith(SESSION_SUFFIX));
    const sessions: Session[] = [];
    for (const file of files) {
      try {
        const parsed = Session.safeParse(JSON.parse(await readFile(join(dir, file), 'utf8')));
        if (parsed.success && parsed.data.adventureId === adventureId) sessions.push(parsed.data);
      } catch {
        // A broken session file is skipped; the adventure still plays.
      }
    }
    return sessions;
  }

  /** The session started last for an adventure. */
  async latestSession(adventureId: string): Promise<Session | undefined> {
    const sessions = await this.sessions(adventureId);
    return sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  }

  async saveSession(session: Session): Promise<void> {
    await this.serial(async () => {
      await mkdir(join(this.dir, SESSION_DIR), { recursive: true });
      await writeAtomic(this.sessionPath(session.id), `${JSON.stringify(session, null, 2)}\n`);
    });
  }

  private sessionPath(id: string): string {
    return join(this.dir, SESSION_DIR, `${safeName(id)}${SESSION_SUFFIX}`);
  }

  private async freeName(base: string, suffix: string): Promise<string> {
    const taken = new Set((await readdir(this.dir)).map((f) => f.toLowerCase()));
    let file = `${base}${suffix}`;
    for (let n = 2; taken.has(file); n++) file = `${base}-${n}${suffix}`;
    return file;
  }

  /** Runs writes one after another, so two saves never pick the same new file name. */
  private serial<T>(task: () => Promise<T>): Promise<T> {
    const result = this.writes.then(task);
    this.writes = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

/**
 * Reads an adventure file. Like the app's own storage it checks the shape only: an adventure the
 * game master is still editing may point to a scene that is not there yet, and must not vanish.
 */
function readAdventureFile(
  text: string,
): { ok: true; adventure: Adventure } | { ok: false; problems: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { ok: false, problems: [`Invalid JSON: ${(error as Error).message}`] };
  }
  const file = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  if (file.format !== ADVENTURE_FILE_FORMAT) {
    return { ok: false, problems: ['Not a Lorewarden adventure file'] };
  }
  const parsed = Adventure.safeParse(file.adventure);
  return parsed.success
    ? { ok: true, adventure: parsed.data }
    : {
        ok: false,
        problems: parsed.error.issues.map((i) => `${i.path.map(String).join('.')}: ${i.message}`),
      };
}

/** Writes next to the file and renames, so a crash never leaves half a file behind. */
async function writeAtomic(path: string, text: string): Promise<void> {
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, text, 'utf8');
  await rename(temp, path);
}

/** Turns "The Lantern in the Marsh" into "the-lantern-in-the-marsh". */
export function slug(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Ids come from the app; only safe characters may reach a file name. */
function safeName(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}
