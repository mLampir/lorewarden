import {
  type Adventure,
  Adventure as AdventureSchema,
  checkIntegrity,
  type Monster,
  type Party,
  type PartyHistory,
  partyHistory,
} from '@lorewarden/core';
import { type BrokenFile, Store } from '@lorewarden/store';

export type { BrokenFile };

export interface StoredAdventure {
  adventure: Adventure;
  /** File name inside the adventure folder; missing for adventures in the app. */
  file?: string;
}

/** What list_adventures shows of an adventure. */
export interface AdventureSummary {
  id: string;
  title: string;
  /** Size and level of the party; missing when an older Lorewarden server does not say. */
  party?: Adventure['party'];
  scenes: number;
  /** File name inside the adventure folder; missing for adventures in the app. */
  file?: string;
}

/** Thrown when a change would leave the adventure invalid; the file stays untouched. */
export class AdventureError extends Error {}

/**
 * Runs tasks one after another, so a read, change and write is not mixed with another one when
 * the assistant calls several tools at once.
 */
export function serializer(): <T>(task: () => Promise<T>) => Promise<T> {
  let queue: Promise<unknown> = Promise.resolve();
  return (task) => {
    const result = queue.then(task);
    queue = result.catch(() => undefined);
    return result;
  };
}

/** Where the tools read and write adventures: a folder, or the open app. */
export interface Adventures {
  /** Says where the adventures are, so the AI can tell the game master. */
  readonly location: string;
  list(): Promise<{ adventures: AdventureSummary[]; broken: BrokenFile[] }>;
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
  /** The adventures a party played with their sessions and notes, or undefined without the party. */
  partyHistory(partyId: string): Promise<PartyHistory | undefined>;
  /**
   * Changes a party and saves it, without losing what a phone entered meanwhile. Returns the
   * changed party, or undefined when there is no party with this id.
   */
  changeParty(partyId: string, change: (party: Party) => Party): Promise<Party | undefined>;
}

/**
 * Works on the adventure folder of Lorewarden on this computer while the app is not running, with
 * the same store the Lorewarden server uses. Every write is validated first, so the folder only
 * ever holds files the app accepts.
 */
export class AdventureStore implements Adventures {
  private readonly store: Store;

  constructor(readonly dir: string) {
    this.store = new Store(dir);
  }

  get location(): string {
    return `the folder ${this.dir}`;
  }

  async list(): Promise<{ adventures: AdventureSummary[]; broken: BrokenFile[] }> {
    const { adventures, broken } = await this.store.list();
    return {
      adventures: adventures.map(({ id, title, party, sceneCount, file }) => ({
        id,
        title,
        party,
        scenes: sceneCount,
        file,
      })),
      broken,
    };
  }

  async get(id: string): Promise<StoredAdventure> {
    const stored = await this.store.read(id);
    if (!stored) throw missing(id);
    // The store hands out what it cached, which must not change.
    return { adventure: structuredClone(stored.adventure), file: stored.file };
  }

  /** Saves a new adventure under a file name made from its title. */
  async add(adventure: Adventure): Promise<StoredAdventure> {
    const stored = await this.store.create(validate(adventure));
    if (!stored) {
      throw new AdventureError(`An adventure with id "${adventure.id}" already exists.`);
    }
    return { adventure: stored.adventure, file: stored.file };
  }

  /** Applies a change to an adventure and saves it, or throws and leaves the file as it was. */
  async update(id: string, change: (adventure: Adventure) => Adventure): Promise<Adventure> {
    const stored = await this.store.update(id, (current) => {
      const adventure = validate(change(current));
      if (adventure.id !== id) throw new AdventureError('The id of an adventure cannot change.');
      return adventure;
    });
    if (!stored) throw missing(id);
    return stored.adventure;
  }

  async monsters(): Promise<Monster[]> {
    return (await this.store.monsters()).monsters;
  }

  async saveMonster(monster: Monster): Promise<void> {
    await this.store.saveMonster(monster);
  }

  async parties(): Promise<Party[]> {
    return (await this.store.parties()).parties;
  }

  async partyHistory(partyId: string): Promise<PartyHistory | undefined> {
    const party = (await this.parties()).find((p) => p.id === partyId);
    if (!party) return undefined;
    const sessions = await this.store.partySessions(partyId);
    const adventures: Adventure[] = [];
    for (const adventureId of new Set(sessions.map((s) => s.adventureId))) {
      const adventure = await this.store.get(adventureId);
      if (adventure) adventures.push(adventure);
    }
    return partyHistory(party, sessions, adventures);
  }

  changeParty(partyId: string, change: (party: Party) => Party): Promise<Party | undefined> {
    return this.store.changeParty((party) => party.id === partyId, change);
  }
}

function missing(id: string): AdventureError {
  return new AdventureError(`No adventure with id "${id}". Call list_adventures to see them.`);
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
