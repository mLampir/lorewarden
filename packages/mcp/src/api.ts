import {
  type Adventure,
  Adventure as AdventureSchema,
  AiSettings,
  Monster,
  Party,
  Session,
} from '@lorewarden/core';
import {
  AdventureError,
  type AdventureSummary,
  type Adventures,
  type BrokenFile,
  type StoredAdventure,
  serializer,
  validate,
} from './store';

/** Marks the changes of the AI assistant, so the open app reloads them. */
const CLIENT = 'mcp';
/**
 * How often a change is applied again to a newer version when the adventure changed between
 * reading and saving it, e.g. because the game master is typing in the app.
 */
const SAVE_ATTEMPTS = 4;

/** An adventure read from the server with the ETag of its version. */
interface Versioned {
  adventure: Adventure;
  etag: string | undefined;
}

/** What is happening at the table right now. */
export interface TableState {
  adventure: Adventure;
  session: Session;
}

class Unreachable extends Error {}

/**
 * Works on the adventures kept by the Lorewarden server, the same ones the game master app shows.
 * Every change is saved there, and the open app shows it right away.
 *
 * While the server is not running, the tools fall back to the adventure folder, if there is one.
 * The server reads the same folder when it starts.
 */
export class ServerAdventures implements Adventures {
  private reachable = true;
  private readonly serial = serializer();

  constructor(
    private readonly url: string,
    private readonly fallback?: Adventures,
    /** Lets this program in when the Lorewarden server has a password. */
    private readonly token?: string,
  ) {}

  get location(): string {
    return this.reachable || !this.fallback
      ? `the Lorewarden server at ${this.url}`
      : `${this.fallback.location}, because the Lorewarden server is not running`;
  }

  async list(): Promise<{ adventures: AdventureSummary[]; broken: BrokenFile[] }> {
    return this.withFallback(
      async () => {
        const body = (await this.json('/api/adventures')) as {
          adventures: { id: string; title: string; sceneCount: number; party?: unknown }[];
          broken: BrokenFile[];
        };
        // The list names everything list_adventures shows, so no adventure is read in full.
        const adventures = body.adventures.map(({ id, title, sceneCount, party }) => ({
          id,
          title,
          ...(party ? { party: party as Adventure['party'] } : {}),
          scenes: sceneCount,
        }));
        return { adventures, broken: body.broken };
      },
      (fallback) => fallback.list(),
    );
  }

  async get(id: string): Promise<StoredAdventure> {
    return this.withFallback(
      async () => {
        const found = await this.find(id);
        if (!found) {
          throw new AdventureError(
            `No adventure with id "${id}". Call list_adventures to see them.`,
          );
        }
        return { adventure: found.adventure };
      },
      (fallback) => fallback.get(id),
    );
  }

  async add(adventure: Adventure): Promise<StoredAdventure> {
    return this.serial(() => this.addNow(adventure));
  }

  private async addNow(adventure: Adventure): Promise<StoredAdventure> {
    return this.withFallback(
      async () => {
        if (await this.find(adventure.id)) {
          throw new AdventureError(`An adventure with id "${adventure.id}" already exists.`);
        }
        const valid = validate(adventure);
        await this.save(valid, undefined);
        return { adventure: valid };
      },
      (fallback) => fallback.add(adventure),
    );
  }

  async update(id: string, change: (adventure: Adventure) => Adventure): Promise<Adventure> {
    return this.serial(() => this.updateNow(id, change));
  }

  private async updateNow(
    id: string,
    change: (adventure: Adventure) => Adventure,
  ): Promise<Adventure> {
    return this.withFallback(
      async () => {
        // Saved only if nothing else saved the adventure since it was read; otherwise the change
        // is applied again to the newer version, so the game master's edit is not lost.
        let current = await this.find(id);
        for (let attempt = 0; attempt < SAVE_ATTEMPTS; attempt++) {
          if (!current) {
            throw new AdventureError(
              `No adventure with id "${id}". Call list_adventures to see them.`,
            );
          }
          const adventure = validate(change(structuredClone(current.adventure)));
          if (adventure.id !== id) {
            throw new AdventureError('The id of an adventure cannot change.');
          }
          const result = await this.save(adventure, current.etag);
          if (result.saved) return adventure;
          current = result.current;
        }
        throw new AdventureError(
          `The adventure "${id}" kept changing while this change was saved, probably because the game master is editing it. Nothing was saved; call the tool again.`,
        );
      },
      (fallback) => fallback.update(id, change),
    );
  }

  async monsters(): Promise<Monster[]> {
    return this.withFallback(
      async () => {
        const body = (await this.json('/api/monsters')) as { monsters?: unknown[] } | undefined;
        return (body?.monsters ?? []).flatMap((entry) => {
          const parsed = Monster.safeParse(entry);
          return parsed.success ? [parsed.data] : [];
        });
      },
      (fallback) => fallback.monsters(),
    );
  }

  async saveMonster(monster: Monster): Promise<void> {
    return this.withFallback(
      async () => {
        await this.request(`/api/monsters/${encodeURIComponent(monster.id)}`, {
          method: 'PUT',
          body: JSON.stringify(monster),
        });
      },
      (fallback) => fallback.saveMonster(monster),
    );
  }

  async parties(): Promise<Party[]> {
    return this.withFallback(
      async () => {
        const body = (await this.json('/api/parties')) as { parties?: unknown[] } | undefined;
        return (body?.parties ?? []).flatMap((entry) => {
          const parsed = Party.safeParse(entry);
          return parsed.success ? [parsed.data] : [];
        });
      },
      (fallback) => fallback.parties(),
    );
  }

  /** The adventure being played and its session: the session the app saved last. */
  async tableState(): Promise<TableState | undefined> {
    try {
      const session = Session.safeParse(await this.json('/api/sessions/current'));
      if (!session.success) return undefined;
      const found = await this.find(session.data.adventureId);
      return found ? { adventure: found.adventure, session: session.data } : undefined;
    } catch {
      return undefined;
    }
  }

  /** The languages for new adventures chosen in the app. */
  async appSettings(): Promise<AiSettings | undefined> {
    try {
      const parsed = AiSettings.safeParse(await this.json('/api/settings'));
      // Until the app has been opened, the server knows no settings.
      return parsed.success && parsed.data.language ? parsed.data : undefined;
    } catch {
      return undefined;
    }
  }

  private async withFallback<T>(
    onServer: () => Promise<T>,
    inFolder: (fallback: Adventures) => Promise<T>,
  ): Promise<T> {
    try {
      const result = await onServer();
      this.reachable = true;
      return result;
    } catch (error) {
      if (!(error instanceof Unreachable)) throw error;
      this.reachable = false;
      if (this.fallback) return inFolder(this.fallback);
      throw new AdventureError(
        `The Lorewarden server at ${this.url} cannot be reached. Ask the game master to start Lorewarden.`,
      );
    }
  }

  private async find(id: string): Promise<Versioned | undefined> {
    const response = await this.request(`/api/adventures/${encodeURIComponent(id)}`);
    if (response.status === 404) return undefined;
    return versioned(id, response);
  }

  /**
   * Saves an adventure. With an ETag, the server refuses the save when the adventure changed
   * since; then the current version is returned, or undefined when it was deleted.
   */
  private async save(
    adventure: Adventure,
    etag: string | undefined,
  ): Promise<{ saved: true } | { saved: false; current: Versioned | undefined }> {
    const response = await this.request(`/api/adventures/${encodeURIComponent(adventure.id)}`, {
      method: 'PUT',
      body: JSON.stringify(adventure),
      ...(etag ? { headers: { 'If-Match': etag } } : {}),
    });
    if (response.status !== 412) return { saved: true };
    const deleted = !(response.headers.get('Content-Type') ?? '').includes('json');
    return { saved: false, current: deleted ? undefined : await versioned(adventure.id, response) };
  }

  /** The answer's JSON, or undefined if there is none. */
  private async json(path: string): Promise<unknown> {
    const response = await this.request(path);
    return response.status === 404 ? undefined : response.json();
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(`${this.url}${path}`, {
        ...init,
        headers: {
          ...init.headers,
          'Content-Type': 'application/json',
          'X-Lorewarden-Client': CLIENT,
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
      });
    } catch {
      throw new Unreachable();
    }
    // 412: a save based on an older version, which the caller applies again.
    if (!response.ok && response.status !== 404 && response.status !== 412) {
      throw new AdventureError(
        `The Lorewarden server answered ${response.status}: ${await response.text()}`,
      );
    }
    return response;
  }
}

/** Reads an adventure and its ETag from the server's answer. */
async function versioned(id: string, response: Response): Promise<Versioned> {
  const parsed = AdventureSchema.safeParse(await response.json());
  if (!parsed.success) throw new AdventureError(`The adventure "${id}" is not valid.`);
  return { adventure: parsed.data, etag: response.headers.get('ETag') ?? undefined };
}
