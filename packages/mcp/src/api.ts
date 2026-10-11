import {
  type Adventure,
  Adventure as AdventureSchema,
  AiSettings,
  Monster,
  Session,
} from '@lorewarden/core';
import {
  AdventureError,
  type Adventures,
  type BrokenFile,
  type StoredAdventure,
  validate,
} from './store';

/** Marks the changes of the AI assistant, so the open app reloads them. */
const CLIENT = 'mcp';

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

  constructor(
    private readonly url: string,
    private readonly fallback?: Adventures,
  ) {}

  get location(): string {
    return this.reachable || !this.fallback
      ? `the Lorewarden server at ${this.url}`
      : `${this.fallback.location}, because the Lorewarden server is not running`;
  }

  async list(): Promise<{ adventures: StoredAdventure[]; broken: BrokenFile[] }> {
    return this.withFallback(
      async () => {
        const body = (await this.json('/api/adventures')) as {
          adventures: { id: string }[];
          broken: BrokenFile[];
        };
        const adventures: StoredAdventure[] = [];
        for (const { id } of body.adventures) {
          const adventure = await this.find(id);
          if (adventure) adventures.push({ adventure });
        }
        return { adventures, broken: body.broken };
      },
      (fallback) => fallback.list(),
    );
  }

  async get(id: string): Promise<StoredAdventure> {
    return this.withFallback(
      async () => {
        const adventure = await this.find(id);
        if (!adventure) {
          throw new AdventureError(
            `No adventure with id "${id}". Call list_adventures to see them.`,
          );
        }
        return { adventure };
      },
      (fallback) => fallback.get(id),
    );
  }

  async add(adventure: Adventure): Promise<StoredAdventure> {
    return this.withFallback(
      async () => {
        if (await this.find(adventure.id)) {
          throw new AdventureError(`An adventure with id "${adventure.id}" already exists.`);
        }
        const valid = validate(adventure);
        await this.save(valid);
        return { adventure: valid };
      },
      (fallback) => fallback.add(adventure),
    );
  }

  async update(id: string, change: (adventure: Adventure) => Adventure): Promise<Adventure> {
    return this.withFallback(
      async () => {
        const current = await this.find(id);
        if (!current) {
          throw new AdventureError(
            `No adventure with id "${id}". Call list_adventures to see them.`,
          );
        }
        const adventure = validate(change(structuredClone(current)));
        if (adventure.id !== id) throw new AdventureError('The id of an adventure cannot change.');
        await this.save(adventure);
        return adventure;
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

  /** The adventure being played and its session: the session the app saved last. */
  async tableState(): Promise<TableState | undefined> {
    try {
      const session = Session.safeParse(await this.json('/api/sessions/current'));
      if (!session.success) return undefined;
      const adventure = await this.find(session.data.adventureId);
      return adventure ? { adventure, session: session.data } : undefined;
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

  private async find(id: string): Promise<Adventure | undefined> {
    const body = await this.json(`/api/adventures/${encodeURIComponent(id)}`);
    if (body === undefined) return undefined;
    const parsed = AdventureSchema.safeParse(body);
    if (!parsed.success) throw new AdventureError(`The adventure "${id}" is not valid.`);
    return parsed.data;
  }

  private async save(adventure: Adventure): Promise<void> {
    await this.request(`/api/adventures/${encodeURIComponent(adventure.id)}`, {
      method: 'PUT',
      body: JSON.stringify(adventure),
    });
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
        headers: { 'Content-Type': 'application/json', 'X-Lorewarden-Client': CLIENT },
      });
    } catch {
      throw new Unreachable();
    }
    if (!response.ok && response.status !== 404) {
      throw new AdventureError(
        `The Lorewarden server answered ${response.status}: ${await response.text()}`,
      );
    }
    return response;
  }
}
