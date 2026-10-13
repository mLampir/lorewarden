import { createHash } from 'node:crypto';
import {
  constants,
  copyFile,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import {
  ADVENTURE_FILE_FORMAT,
  ADVENTURE_FILE_VERSION,
  Adventure,
  MONSTER_LIBRARY_FILE,
  type Monster,
  PARTY_LIBRARY_FILE,
  type Party,
  parseMonsterLibrary,
  parsePartyLibrary,
  Session,
  serializeAdventure,
  serializeMonsterLibrary,
  serializePartyLibrary,
  upsertLibraryMonster,
  upsertParty,
} from '@lorewarden/core';

export const ADVENTURE_SUFFIX = '.adventure.json';
const SESSION_SUFFIX = '.session.json';
const SESSION_DIR = 'sessions';

export interface AdventureSummary {
  id: string;
  title: string;
  sceneCount: number;
  updatedAt: string;
  /** Size and level of the party, and the game master's party it follows, if any. */
  party: Adventure['party'];
}

/** A file in the folder that is not a valid adventure, so the game master can be told. */
export interface BrokenFile {
  file: string;
  problems: string[];
}

/** An adventure as stored, with the revision of its file. */
export interface StoredAdventure {
  adventure: Adventure;
  revision: string;
}

/**
 * Thrown when a write names a revision that is no longer the stored one, because something else
 * saved in between. Carries what is stored now, if anything.
 */
export class RevisionMismatch<T> extends Error {
  constructor(readonly current: T | undefined) {
    super('Changed meanwhile');
  }
}

interface Entry {
  adventure: Adventure;
  file: string;
  updatedAt: string;
  revision: string;
}

interface CachedFile {
  mtimeMs: number;
  size: number;
  revision: string;
  value: unknown;
}

/**
 * Keeps adventures as Lorewarden adventure files in one folder, the same files the app exports
 * and imports, and the sessions played with them in a subfolder. The folder is looked at again
 * for every list, so files copied in by hand appear without a restart; a file is read and checked
 * again only when its time or size changed. Values handed out come from that cache and must not
 * be changed.
 *
 * Every file has a revision, a hash of its text. A write may name the revision it is based on and
 * is refused when the file changed since, so no change overwrites another one unseen.
 */
export class Store {
  private writes = Promise.resolve();
  /** Parsed files by path, valid while their time and size stay the same. */
  private readonly cache = new Map<string, CachedFile>();

  constructor(readonly dir: string) {}

  /**
   * Reads and parses a file, or takes it from the cache when it did not change. Time and size are
   * looked at before the file is read, so a change in between is read again the next time.
   */
  private async cached<T>(
    path: string,
    parse: (text: string) => T,
  ): Promise<{ value: T; revision: string; mtimeMs: number }> {
    const info = await stat(path);
    const hit = this.cache.get(path);
    if (hit && hit.mtimeMs === info.mtimeMs && hit.size === info.size) {
      return { value: hit.value as T, revision: hit.revision, mtimeMs: hit.mtimeMs };
    }
    const text = await readFile(path, 'utf8');
    const value = parse(text);
    const revision = revisionOf(text);
    this.cache.set(path, { mtimeMs: info.mtimeMs, size: info.size, revision, value });
    return { value, revision, mtimeMs: info.mtimeMs };
  }

  /** Writes a file, forgets what was cached for it and returns its new revision. */
  private async write(path: string, text: string): Promise<string> {
    await writeAtomic(path, text);
    this.cache.delete(path);
    return revisionOf(text);
  }

  private async entries(): Promise<{ entries: Entry[]; broken: BrokenFile[] }> {
    await mkdir(this.dir, { recursive: true });
    const files = (await readdir(this.dir)).filter((f) => f.endsWith(ADVENTURE_SUFFIX)).sort();
    const entries: Entry[] = [];
    const broken: BrokenFile[] = [];
    const seen = new Set<string>();
    for (const file of files) {
      const path = join(this.dir, file);
      seen.add(path);
      let read: { value: AdventureFileResult; revision: string; mtimeMs: number };
      try {
        read = await this.cached(path, readAdventureFile);
      } catch (error) {
        // A file that cannot be read, or vanished meanwhile, must not hide the others.
        broken.push({ file, problems: [`Cannot read the file: ${(error as Error).message}`] });
        continue;
      }
      const { value: result, revision, mtimeMs } = read;
      if (result.ok) {
        const updatedAt = new Date(mtimeMs).toISOString();
        entries.push({ adventure: result.adventure, file, updatedAt, revision });
      } else {
        broken.push({ file, problems: result.problems });
      }
    }
    // Files removed by hand are forgotten.
    for (const path of this.cache.keys()) {
      if (path.endsWith(ADVENTURE_SUFFIX) && !seen.has(path)) this.cache.delete(path);
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
        party: adventure.party,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { adventures, broken };
  }

  async get(id: string): Promise<Adventure | undefined> {
    return (await this.read(id))?.adventure;
  }

  /** An adventure with the revision of its file. */
  async read(id: string): Promise<StoredAdventure | undefined> {
    const { entries } = await this.entries();
    return stored(entries.find((e) => e.adventure.id === id));
  }

  /**
   * Saves an adventure, in its own file or in a new one named after its title, and returns the new
   * revision. With ifMatch, throws a RevisionMismatch when the stored revision is another one.
   */
  async save(adventure: Adventure, ifMatch?: string): Promise<string> {
    return this.serial(async () => {
      const { entries } = await this.entries();
      const entry = entries.find((e) => e.adventure.id === adventure.id);
      if (ifMatch !== undefined && !matches(ifMatch, entry?.revision)) {
        throw new RevisionMismatch(stored(entry));
      }
      const file =
        entry?.file ??
        (await this.freeName(slug(adventure.title) || 'adventure', ADVENTURE_SUFFIX));
      return this.write(join(this.dir, file), serializeAdventure(adventure));
    });
  }

  /** Deletes an adventure together with its sessions. Returns false if there was none. */
  async delete(id: string): Promise<boolean> {
    return this.serial(async () => {
      const { entries } = await this.entries();
      const entry = entries.find((e) => e.adventure.id === id);
      if (!entry) return false;
      await rm(join(this.dir, entry.file), { force: true });
      for (const { session } of await this.sessions(id)) {
        await rm(this.sessionPath(session.id), { force: true });
      }
      return true;
    });
  }

  private async sessions(adventureId?: string): Promise<{ session: Session; savedAt: number }[]> {
    const dir = join(this.dir, SESSION_DIR);
    await mkdir(dir, { recursive: true });
    const files = (await readdir(dir)).filter((f) => f.endsWith(SESSION_SUFFIX));
    const sessions: { session: Session; savedAt: number }[] = [];
    for (const file of files) {
      try {
        const { value: session, mtimeMs } = await this.cached(join(dir, file), readSessionFile);
        if (!session) continue;
        if (adventureId !== undefined && session.adventureId !== adventureId) continue;
        sessions.push({ session, savedAt: mtimeMs });
      } catch {
        // A broken session file is skipped; the adventure still plays.
      }
    }
    return sessions;
  }

  /** The session started last for an adventure. */
  async latestSession(adventureId: string): Promise<Session | undefined> {
    const sessions = (await this.sessions(adventureId)).map(({ session }) => session);
    return sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  }

  /** The session saved last, which is the one being played if live mode is open. */
  async currentSession(): Promise<Session | undefined> {
    const sessions = await this.sessions();
    return sessions.sort((a, b) => b.savedAt - a.savedAt)[0]?.session;
  }

  async saveSession(session: Session): Promise<void> {
    await this.serial(async () => {
      await mkdir(join(this.dir, SESSION_DIR), { recursive: true });
      await this.write(this.sessionPath(session.id), `${JSON.stringify(session, null, 2)}\n`);
    });
  }

  /** A library file next to the adventures with its revision; a missing file is an empty one. */
  private async library<T extends object>(
    file: string,
    parse: (text: string) => T,
    empty: T,
  ): Promise<T & { revision: string }> {
    try {
      const { value, revision } = await this.cached(join(this.dir, file), parse);
      return { ...value, revision };
    } catch (error) {
      // Only a file that is missing or cannot be read counts as empty, never one that is broken.
      if ((error as NodeJS.ErrnoException).code === undefined) throw error;
      return { ...empty, revision: revisionOf('') };
    }
  }

  /** The game master's own monsters, kept in one file next to the adventures. */
  async monsters(): Promise<{ monsters: Monster[]; problems: string[]; revision: string }> {
    return this.library(MONSTER_LIBRARY_FILE, parseMonsterLibrary, { monsters: [], problems: [] });
  }

  /**
   * Adds a monster or replaces the one with the same id, and returns the library's new revision.
   * With ifMatch, throws a RevisionMismatch when the library changed since.
   */
  async saveMonster(monster: Monster, ifMatch?: string): Promise<string> {
    return this.serial(async () => {
      const { monsters, problems, revision } = await this.monsters();
      if (ifMatch !== undefined && !matches(ifMatch, revision)) {
        throw new RevisionMismatch(revision);
      }
      return this.writeMonsters(upsertLibraryMonster(monsters, monster), problems);
    });
  }

  /** Removes a monster from the library. Returns false if there was none. */
  async deleteMonster(id: string): Promise<boolean> {
    return this.serial(async () => {
      const { monsters, problems } = await this.monsters();
      const rest = monsters.filter((m) => m.id !== id);
      if (rest.length === monsters.length) return false;
      await this.writeMonsters(rest, problems);
      return true;
    });
  }

  private async writeMonsters(monsters: Monster[], problems: string[]): Promise<string> {
    await mkdir(this.dir, { recursive: true });
    await this.keepCopy(MONSTER_LIBRARY_FILE, problems);
    return this.write(join(this.dir, MONSTER_LIBRARY_FILE), serializeMonsterLibrary(monsters));
  }

  /** The game master's parties of player characters, kept in one file next to the adventures. */
  async parties(): Promise<{ parties: Party[]; problems: string[]; revision: string }> {
    return this.library(PARTY_LIBRARY_FILE, parsePartyLibrary, { parties: [], problems: [] });
  }

  /**
   * Adds a party or replaces the one with the same id, and returns the library's new revision.
   * With ifMatch, throws a RevisionMismatch when the library changed since, e.g. because a player
   * entered a character on their phone.
   */
  async saveParty(party: Party, ifMatch?: string): Promise<string> {
    return this.serial(async () => {
      const { parties, problems, revision } = await this.parties();
      if (ifMatch !== undefined && !matches(ifMatch, revision)) {
        throw new RevisionMismatch(revision);
      }
      return this.writeParties(upsertParty(parties, party), problems);
    });
  }

  /**
   * Changes the first party that matches, under the same lock as every other write. Returns the
   * changed party, or undefined when none matches or change returns undefined.
   */
  async changeParty(
    matches: (party: Party) => boolean,
    change: (party: Party) => Party | undefined,
  ): Promise<Party | undefined> {
    return this.serial(async () => {
      const { parties, problems } = await this.parties();
      const found = parties.find(matches);
      const changed = found && change(found);
      if (!changed) return undefined;
      await this.writeParties(upsertParty(parties, changed), problems);
      return changed;
    });
  }

  /** Removes a party. Returns false if there was none. */
  async deleteParty(id: string): Promise<boolean> {
    return this.serial(async () => {
      const { parties, problems } = await this.parties();
      const rest = parties.filter((p) => p.id !== id);
      if (rest.length === parties.length) return false;
      await this.writeParties(rest, problems);
      return true;
    });
  }

  private async writeParties(parties: Party[], problems: string[]): Promise<string> {
    await mkdir(this.dir, { recursive: true });
    await this.keepCopy(PARTY_LIBRARY_FILE, problems);
    return this.write(join(this.dir, PARTY_LIBRARY_FILE), serializePartyLibrary(parties));
  }

  /**
   * Before a library file that could not be read in full is written again, e.g. one with a typo
   * or from a newer Lorewarden, copies it next to itself, so what was skipped is not lost.
   */
  private async keepCopy(file: string, problems: string[]): Promise<void> {
    if (problems.length === 0) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const path = join(this.dir, file);
    await copyFile(path, `${path}.bak-${stamp}`, constants.COPYFILE_EXCL);
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

function stored(entry: Entry | undefined): StoredAdventure | undefined {
  return entry && { adventure: entry.adventure, revision: entry.revision };
}

/** A short hash of a file's text, which changes whenever the text does. */
function revisionOf(text: string): string {
  return createHash('sha256').update(text).digest('base64url').slice(0, 22);
}

/** Whether an If-Match value names the stored revision; "*" matches any stored file. */
function matches(ifMatch: string, revision: string | undefined): boolean {
  if (revision === undefined) return false;
  return ifMatch
    .split(',')
    .map((tag) =>
      tag
        .trim()
        .replace(/^W\//, '')
        .replace(/^"(.*)"$/, '$1'),
    )
    .some((tag) => tag === '*' || tag === revision);
}

type AdventureFileResult = { ok: true; adventure: Adventure } | { ok: false; problems: string[] };

/**
 * Reads an adventure file. Like the app's own storage it checks the shape only: an adventure the
 * game master is still editing may point to a scene that is not there yet, and must not vanish.
 */
function readAdventureFile(text: string): AdventureFileResult {
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
  // Saving it here would drop what the newer version added, so it stays untouched.
  if (typeof file.version === 'number' && file.version > ADVENTURE_FILE_VERSION) {
    return {
      ok: false,
      problems: [
        `Made with a newer Lorewarden (file version ${file.version}); update Lorewarden to open it`,
      ],
    };
  }
  const parsed = Adventure.safeParse(file.adventure);
  return parsed.success
    ? { ok: true, adventure: parsed.data }
    : {
        ok: false,
        problems: parsed.error.issues.map((i) => `${i.path.map(String).join('.')}: ${i.message}`),
      };
}

/** A session file, or undefined when it is not a valid session. */
function readSessionFile(text: string): Session | undefined {
  const parsed = Session.safeParse(JSON.parse(text));
  return parsed.success ? parsed.data : undefined;
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
