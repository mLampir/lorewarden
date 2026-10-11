import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { type Adventure, Adventure as AdventureSchema, Session } from '@lorewarden/core';
import {
  AdventureError,
  type Adventures,
  type BrokenFile,
  type StoredAdventure,
  validate,
} from './store';

export const DEFAULT_PORT = 47615;

const MAX_BODY_BYTES = 200 * 1024 * 1024;
const KEEP_ALIVE_MS = 25_000;
const SYNC_WAIT_MS = 3_000;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** What is happening at the table right now, as the app last reported it. */
export interface TableState {
  adventure: Adventure;
  session: Session;
}

/**
 * Connects the MCP server with the game master app open in a browser on the same computer.
 *
 * The app opens an event stream to this server and sends its adventures and sessions whenever they
 * change. While the app is connected, the tools work on its adventures and every change the AI
 * makes appears in the app right away; otherwise they fall back to the folder.
 *
 * Only pages served from this computer, or from origins the user allows, may talk to the bridge.
 */
export class AppBridge implements Adventures {
  private readonly adventures = new Map<string, Adventure>();
  private readonly sessions = new Map<string, Session>();
  private activeAdventureId: string | undefined;
  private readonly clients = new Set<ServerResponse>();
  /** False from the moment the app connects until it has sent its adventures. */
  private synced = false;
  private syncWaiters: (() => void)[] = [];
  private server: Server | undefined;

  constructor(
    private readonly fallback: Adventures,
    private readonly allowedOrigins: string[] = [],
  ) {}

  get connected(): boolean {
    return this.clients.size > 0 && this.synced;
  }

  /** Waits briefly for an app that has just connected to send its adventures. */
  private async ready(): Promise<void> {
    if (this.clients.size === 0 || this.synced) return;
    await new Promise<void>((resolve) => {
      this.syncWaiters.push(resolve);
      setTimeout(resolve, SYNC_WAIT_MS);
    });
  }

  get location(): string {
    return this.connected ? 'the open Lorewarden app' : this.fallback.location;
  }

  async list(): Promise<{ adventures: StoredAdventure[]; broken: BrokenFile[] }> {
    await this.ready();
    if (!this.connected) return this.fallback.list();
    const adventures = [...this.adventures.values()].map((adventure) => ({ adventure }));
    return { adventures, broken: [] };
  }

  async get(id: string): Promise<StoredAdventure> {
    await this.ready();
    if (!this.connected) return this.fallback.get(id);
    const adventure = this.adventures.get(id);
    if (!adventure) {
      throw new AdventureError(`No adventure with id "${id}". Call list_adventures to see them.`);
    }
    return { adventure };
  }

  async add(adventure: Adventure): Promise<StoredAdventure> {
    await this.ready();
    if (!this.connected) return this.fallback.add(adventure);
    if (this.adventures.has(adventure.id)) {
      throw new AdventureError(`An adventure with id "${adventure.id}" already exists.`);
    }
    const valid = validate(adventure);
    this.adventures.set(valid.id, valid);
    this.send('adventure', { adventure: valid });
    return { adventure: valid };
  }

  async update(id: string, change: (adventure: Adventure) => Adventure): Promise<Adventure> {
    await this.ready();
    if (!this.connected) return this.fallback.update(id, change);
    const { adventure: current } = await this.get(id);
    const adventure = validate(change(structuredClone(current)));
    if (adventure.id !== id) throw new AdventureError('The id of an adventure cannot change.');
    this.adventures.set(id, adventure);
    this.send('adventure', { adventure });
    return adventure;
  }

  /** The adventure the game master is running and its session, if the app is connected. */
  tableState(): TableState | undefined {
    if (!this.connected || this.activeAdventureId === undefined) return undefined;
    const adventure = this.adventures.get(this.activeAdventureId);
    const session = this.sessions.get(this.activeAdventureId);
    return adventure && session ? { adventure, session } : undefined;
  }

  listen(port = DEFAULT_PORT, host = '127.0.0.1'): Promise<number> {
    const server = createServer((req, res) => {
      this.handle(req, res).catch((error: unknown) => {
        if (!res.headersSent) res.writeHead(500).end(String(error));
      });
    });
    this.server = server;
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => {
        const address = server.address();
        resolve(typeof address === 'object' && address ? address.port : port);
      });
    });
  }

  close(): Promise<void> {
    for (const client of this.clients) client.end();
    this.clients.clear();
    return new Promise((resolve) => (this.server ? this.server.close(() => resolve()) : resolve()));
  }

  private isAllowed(origin: string | undefined): boolean {
    // Requests without an origin come from programs on this computer, not from web pages.
    if (origin === undefined) return true;
    if (this.allowedOrigins.includes(origin)) return true;
    try {
      return LOCAL_HOSTS.has(new URL(origin).hostname);
    } catch {
      return false;
    }
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // A web page that points its own host name at this computer still sends that name here.
    const host = (req.headers.host ?? '').replace(/:\d+$/, '');
    if (!LOCAL_HOSTS.has(host)) {
      res.writeHead(403).end('Host not allowed');
      return;
    }
    const origin = req.headers.origin;
    if (!this.isAllowed(origin)) {
      res.writeHead(403).end('Origin not allowed');
      return;
    }
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE',
        'Access-Control-Allow-Headers': 'Content-Type',
        // Lets a page on a public origin reach this server in browsers that ask first.
        'Access-Control-Allow-Private-Network': 'true',
      });
      res.end();
      return;
    }

    const url = new URL(req.url ?? '/', 'http://localhost');
    const adventureMatch = /^\/adventures\/([^/]+)$/.exec(url.pathname);

    if (req.method === 'GET' && url.pathname === '/events') return this.openStream(res);
    if (req.method === 'POST' && url.pathname === '/sync') {
      const body = await readJson(req);
      this.adventures.clear();
      for (const raw of arrayField(body, 'adventures')) this.storeAdventure(raw);
      this.sessions.clear();
      this.activeAdventureId = undefined;
      const sessions = arrayField(body, 'sessions').flatMap((raw) => {
        const parsed = Session.safeParse(raw);
        return parsed.success ? [parsed.data] : [];
      });
      sessions.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
      for (const session of sessions) this.storeSession(session);
      if (isRecord(body) && typeof body.activeAdventureId === 'string') {
        this.activeAdventureId = body.activeAdventureId;
      }
      this.synced = true;
      for (const resolve of this.syncWaiters.splice(0)) resolve();
      return ok(res);
    }
    if (req.method === 'PUT' && adventureMatch) {
      const body = await readJson(req);
      if (!this.storeAdventure(isRecord(body) ? body.adventure : undefined)) {
        return void res.writeHead(400).end('Invalid adventure');
      }
      return ok(res);
    }
    if (req.method === 'DELETE' && adventureMatch?.[1]) {
      const id = decodeURIComponent(adventureMatch[1]);
      this.adventures.delete(id);
      this.sessions.delete(id);
      if (this.activeAdventureId === id) this.activeAdventureId = undefined;
      return ok(res);
    }
    if (req.method === 'PUT' && url.pathname === '/session') {
      const body = await readJson(req);
      const parsed = Session.safeParse(isRecord(body) ? body.session : undefined);
      if (!parsed.success) return void res.writeHead(400).end('Invalid session');
      this.storeSession(parsed.data);
      return ok(res);
    }
    res.writeHead(404).end('Not found');
  }

  private storeAdventure(raw: unknown): boolean {
    const parsed = AdventureSchema.safeParse(raw);
    if (parsed.success) this.adventures.set(parsed.data.id, parsed.data);
    return parsed.success;
  }

  /** The session the app sent last belongs to the adventure being played. */
  private storeSession(session: Session): void {
    this.sessions.set(session.adventureId, session);
    this.activeAdventureId = session.adventureId;
  }

  private openStream(res: ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('event: hello\ndata: {}\n\n');
    this.clients.add(res);
    this.synced = false;
    const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), KEEP_ALIVE_MS);
    res.on('close', () => {
      clearInterval(keepAlive);
      this.clients.delete(res);
    });
  }

  private send(event: string, data: unknown): void {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.clients) client.write(message);
  }
}

function ok(res: ServerResponse): void {
  res.writeHead(204).end();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function arrayField(body: unknown, key: string): unknown[] {
  const value = isRecord(body) ? body[key] : undefined;
  return Array.isArray(value) ? value : [];
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error('Request body too large');
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return undefined;
  }
}
