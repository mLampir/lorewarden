import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  type Adventure,
  Adventure as AdventureSchema,
  checkIntegrity,
  MONSTER_LIBRARY_FILE,
  type Monster,
  PARTY_LIBRARY_FILE,
  type Party,
  parseAdventure,
  parseMonsterLibrary,
  parsePartyLibrary,
  serializeAdventure,
  serializeMonsterLibrary,
  upsertLibraryMonster,
} from '@lorewarden/core';

export const FILE_SUFFIX = '.adventure.json';

export interface StoredAdventure {
  adventure: Adventure;
  /** File name inside the adventure folder; missing for adventures in the app. */
  file?: string;
}

/** A file in the folder that is not a valid adventure, so the AI can tell the game master. */
export interface BrokenFile {
  file: string;
  problems: string[];
}

/** Thrown when a change would leave the adventure invalid; the file stays untouched. */
export class AdventureError extends Error {}

/** Where the tools read and write adventures: a folder, or the open app. */
export interface Adventures {
  /** Says where the adventures are, so the AI can tell the game master. */
  readonly location: string;
  list(): Promise<{ adventures: StoredAdventure[]; broken: BrokenFile[] }>;
  get(id: string): Promise<StoredAdventure>;
  /** Saves a new adventure. */
  add(adventure: Adventure): Promise<StoredAdventure>;
  /** Applies a change and saves it, or throws and leaves the adventure as it was. */
  update(id: string, change: (adventure: Adventure) => Adventure): Promise<Adventure>;
  /** The game master's own monsters, which every adventure can use. */
  monsters(): Promise<Monster[]>;
  /** Adds a monster to the library or replaces the one with the same id. */
  saveMonster(monster: Monster): Promise<void>;
  /** The game master's parties of player characters. */
  parties(): Promise<Party[]>;
}

/**
 * Keeps adventures as Lorewarden adventure files in one folder, the same files the app exports
 * and imports. Every write is validated first, so the folder only ever holds files the app accepts.
 */
export class AdventureStore implements Adventures {
  constructor(readonly dir: string) {}

  get location(): string {
    return `the folder ${this.dir}`;
  }

  async list(): Promise<{ adventures: StoredAdventure[]; broken: BrokenFile[] }> {
    await mkdir(this.dir, { recursive: true });
    const files = (await readdir(this.dir)).filter((file) => file.endsWith(FILE_SUFFIX)).sort();
    const adventures: StoredAdventure[] = [];
    const broken: BrokenFile[] = [];
    for (const file of files) {
      const result = parseAdventure(await readFile(join(this.dir, file), 'utf8'));
      if (result.ok) adventures.push({ adventure: result.adventure, file });
      else {
        broken.push({ file, problems: result.problems.map((p) => `${p.path}: ${p.message}`) });
      }
    }
    return { adventures, broken };
  }

  async get(id: string): Promise<StoredAdventure> {
    const { adventures } = await this.list();
    const found = adventures.find((stored) => stored.adventure.id === id);
    if (!found) {
      throw new AdventureError(`No adventure with id "${id}". Call list_adventures to see them.`);
    }
    return found;
  }

  /** Saves a new adventure under a file name made from its title. */
  async add(adventure: Adventure): Promise<StoredAdventure> {
    const { adventures } = await this.list();
    if (adventures.some((stored) => stored.adventure.id === adventure.id)) {
      throw new AdventureError(`An adventure with id "${adventure.id}" already exists.`);
    }
    const taken = new Set((await readdir(this.dir)).map((file) => file.toLowerCase()));
    const base = slug(adventure.title) || 'adventure';
    let file = `${base}${FILE_SUFFIX}`;
    for (let n = 2; taken.has(file); n++) file = `${base}-${n}${FILE_SUFFIX}`;
    const stored = { adventure: validate(adventure), file };
    await this.write(stored);
    return stored;
  }

  /** Applies a change to an adventure and saves it, or throws and leaves the file as it was. */
  async update(id: string, change: (adventure: Adventure) => Adventure): Promise<Adventure> {
    const stored = await this.get(id);
    const adventure = validate(change(structuredClone(stored.adventure)));
    if (adventure.id !== id) throw new AdventureError('The id of an adventure cannot change.');
    await this.write({ adventure, file: stored.file ?? '' });
    return adventure;
  }

  async monsters(): Promise<Monster[]> {
    const text = await readFile(join(this.dir, MONSTER_LIBRARY_FILE), 'utf8').catch(
      () => undefined,
    );
    return text === undefined ? [] : parseMonsterLibrary(text).monsters;
  }

  async saveMonster(monster: Monster): Promise<void> {
    const monsters = upsertLibraryMonster(await this.monsters(), monster);
    await this.writeText(MONSTER_LIBRARY_FILE, serializeMonsterLibrary(monsters));
  }

  async parties(): Promise<Party[]> {
    const text = await readFile(join(this.dir, PARTY_LIBRARY_FILE), 'utf8').catch(() => undefined);
    return text === undefined ? [] : parsePartyLibrary(text).parties;
  }

  private async write({ adventure, file }: { adventure: Adventure; file: string }): Promise<void> {
    await this.writeText(file, serializeAdventure(adventure));
  }

  private async writeText(file: string, text: string): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const path = join(this.dir, file);
    // Write next to the file and rename, so a crash never leaves half a file behind.
    const temp = `${path}.${process.pid}.tmp`;
    await writeFile(temp, text, 'utf8');
    await rename(temp, path);
  }
}

/** Fills in defaults and checks the schema and all references between entries. */
export function validate(adventure: Adventure): Adventure {
  const parsed = AdventureSchema.safeParse(adventure);
  if (!parsed.success) {
    const problems = parsed.error.issues.map(
      (i) => `${i.path.map(String).join('.')}: ${i.message}`,
    );
    throw new AdventureError(`The change was not saved:\n${problems.join('\n')}`);
  }
  const problems = checkIntegrity(parsed.data);
  if (problems.length > 0) {
    const lines = problems.map((p) => `${p.path}: ${p.message}`);
    throw new AdventureError(`The change was not saved:\n${lines.join('\n')}`);
  }
  return parsed.data;
}

/** A file name from a title: "The Silent Mill!" becomes "the-silent-mill". */
export function slug(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
