import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, sep } from 'node:path';
import {
  Adventure,
  canSee,
  DEFAULT_SERVER_PORT,
  decodeDataUrl,
  Player,
  playerView,
  Session,
  TableState,
} from '@lorewarden/core';
import type { Store } from './store';

export { DEFAULT_SERVER_PORT };

const MAX_BODY_BYTES = 200 * 1024 * 1024;
const KEEP_ALIVE_MS = 25_000;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
/** Where phones load the player app. */
const PLAYER_PATH = '/play/';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

export interface ServerOptions {
  /** Where adventures and sessions are kept. */
  store: Store;
  /** Folder with the built game master app, served to this computer only. */
  gmDir?: string;
  /** Folder with the built player app, served to the phones. */
  playerDir?: string;
  /** Origins besides localhost that may act as the game master app, e.g. a hosted copy. */
  allowedOrigins?: string[];
}

interface Connection {
  player: Player;
  code: string;
  res: ServerResponse;
}

/**
 * The Lorewarden server on the game master's computer.
 *
 * It keeps the adventures and sessions in a folder and serves the game master app, which reads
 * and writes them through the API; both are open to this computer only. It also listens in the
 * local network: phones load the player app from it and receive only the reveals meant for them,
 * after the game master app has sent what to show. A player needs the join code from the QR code.
 */
export class LorewardenServer {
  private state: TableState | undefined;
  private readonly gameMasters = new Set<ServerResponse>();
  private readonly connections = new Set<Connection>();
  private server: Server | undefined;
  private port = DEFAULT_SERVER_PORT;

  constructor(private readonly options: ServerOptions) {}

  listen(port = DEFAULT_SERVER_PORT, host = '0.0.0.0'): Promise<number> {
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
        this.port = typeof address === 'object' && address ? address.port : port;
        resolve(this.port);
      });
    });
  }

  close(): Promise<void> {
    for (const res of this.gameMasters) res.end();
    for (const connection of this.connections) connection.res.end();
    this.gameMasters.clear();
    this.connections.clear();
    return new Promise((resolve) => (this.server ? this.server.close(() => resolve()) : resolve()));
  }

  /** Addresses at which phones in the local network open the player app. */
  joinUrls(): string[] {
    const urls: string[] = [];
    for (const addresses of Object.values(networkInterfaces())) {
      for (const address of addresses ?? []) {
        if (address.family === 'IPv4' && !address.internal) {
          urls.push(`http://${address.address}:${this.port}${PLAYER_PATH}`);
        }
      }
    }
    return urls;
  }

  /** Players with the player app open right now, each once. */
  onlinePlayers(): Player[] {
    const players = new Map<string, Player>();
    for (const { player } of this.connections) players.set(player.id, player);
    return [...players.values()];
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const { pathname } = url;
    if (req.method === 'GET' && pathname === '/api/player/events') {
      return this.openPlayerStream(res, url);
    }
    const image = /^\/api\/player\/images\/([^/]+)$/.exec(pathname);
    if (req.method === 'GET' && image?.[1]) {
      return this.sendImage(res, decodeURIComponent(image[1]), url);
    }
    if (pathname.startsWith('/api/')) {
      if (!this.admitGameMaster(req, res)) return;
      return this.handleGameMaster(req, res, pathname);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return void res.writeHead(405).end('Method not allowed');
    }
    if (pathname === '/play') return redirect(res, PLAYER_PATH);
    if (pathname.startsWith(PLAYER_PATH)) {
      return this.serveStatic(res, this.options.playerDir, pathname.slice(PLAYER_PATH.length));
    }
    if (!isFromThisComputer(req)) {
      // Phones that open the bare address land in the player app. A file outside it is missing,
      // not a page: answering it with the app would hand a phone HTML instead of a script.
      if (extname(pathname)) return void res.writeHead(404).end('Not found');
      return redirect(res, PLAYER_PATH);
    }
    return this.serveStatic(res, this.options.gmDir, pathname);
  }

  // --- Game master ---------------------------------------------------------------------------

  private isAllowedOrigin(origin: string | undefined): boolean {
    // Requests without an origin come from programs on this computer, not from web pages.
    if (origin === undefined) return true;
    if (this.options.allowedOrigins?.includes(origin)) return true;
    try {
      return LOCAL_HOSTS.has(new URL(origin).hostname);
    } catch {
      return false;
    }
  }

  /** Lets in requests from this computer only; answers CORS preflights. */
  private admitGameMaster(req: IncomingMessage, res: ServerResponse): boolean {
    if (!isFromThisComputer(req)) {
      res.writeHead(403).end('Only the game master app on this computer may do this');
      return false;
    }
    const origin = req.headers.origin;
    if (!this.isAllowedOrigin(origin)) {
      res.writeHead(403).end('Origin not allowed');
      return false;
    }
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Methods': 'GET, PUT, DELETE',
        'Access-Control-Allow-Headers': 'Content-Type, X-Lorewarden-Client',
        // Lets a page on a public origin reach this server in browsers that ask first.
        'Access-Control-Allow-Private-Network': 'true',
      });
      res.end();
      return false;
    }
    return true;
  }

  private async handleGameMaster(
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string,
  ): Promise<void> {
    const { store } = this.options;
    const client = header(req, 'x-lorewarden-client');
    const method = req.method;

    if (method === 'GET' && pathname === '/api/gm/events') return this.openGameMasterStream(res);
    if (method === 'PUT' && pathname === '/api/gm/state') {
      const parsed = TableState.safeParse(await readJson(req));
      if (!parsed.success) return void res.writeHead(400).end('Invalid table state');
      this.setState(parsed.data);
      return void res.writeHead(204).end();
    }

    if (method === 'GET' && pathname === '/api/adventures') {
      return sendJson(res, await store.list());
    }
    const adventureMatch = /^\/api\/adventures\/([^/]+)(\/session)?$/.exec(pathname);
    const id = adventureMatch?.[1] ? decodeURIComponent(adventureMatch[1]) : undefined;
    if (id && adventureMatch?.[2]) {
      if (method !== 'GET') return void res.writeHead(405).end('Method not allowed');
      const session = await store.latestSession(id);
      return session ? sendJson(res, session) : void res.writeHead(404).end('No session');
    }
    if (id && method === 'GET') {
      const adventure = await store.get(id);
      return adventure ? sendJson(res, adventure) : void res.writeHead(404).end('Not found');
    }
    if (id && method === 'PUT') {
      const parsed = Adventure.safeParse(await readJson(req));
      if (!parsed.success || parsed.data.id !== id) {
        return void res.writeHead(400).end('Invalid adventure');
      }
      await store.save(parsed.data);
      this.broadcast('adventure', { id, client });
      return void res.writeHead(204).end();
    }
    if (id && method === 'DELETE') {
      const deleted = await store.delete(id);
      if (deleted) this.broadcast('adventure-deleted', { id, client });
      return void res.writeHead(deleted ? 204 : 404).end();
    }

    const sessionMatch = /^\/api\/sessions\/([^/]+)$/.exec(pathname);
    if (sessionMatch?.[1] && method === 'PUT') {
      const parsed = Session.safeParse(await readJson(req));
      if (!parsed.success || parsed.data.id !== decodeURIComponent(sessionMatch[1])) {
        return void res.writeHead(400).end('Invalid session');
      }
      await store.saveSession(parsed.data);
      return void res.writeHead(204).end();
    }
    res.writeHead(404).end('Not found');
  }

  private openGameMasterStream(res: ServerResponse): void {
    openStream(res);
    this.gameMasters.add(res);
    send(res, 'table', {
      joinUrls: this.joinUrls(),
      players: this.onlinePlayers(),
      dataDir: this.options.store.dir,
    });
    res.on('close', () => this.gameMasters.delete(res));
  }

  private broadcast(event: string, data: unknown): void {
    for (const res of this.gameMasters) send(res, event, data);
  }

  setState(state: TableState): void {
    this.state = state;
    for (const connection of [...this.connections]) {
      if (connection.code === state.code) this.sendView(connection);
      else this.reject(connection);
    }
  }

  // --- Players -------------------------------------------------------------------------------

  private openPlayerStream(res: ServerResponse, url: URL): void {
    const parsed = Player.safeParse({
      id: url.searchParams.get('id'),
      name: url.searchParams.get('name'),
    });
    const code = (url.searchParams.get('code') ?? '').toUpperCase();
    if (!parsed.success || code === '') return void res.writeHead(400).end('Invalid player');
    openStream(res);
    const connection: Connection = { player: parsed.data, code, res };
    if (this.state && this.state.code !== code) {
      this.reject(connection);
      return;
    }
    this.connections.add(connection);
    res.on('close', () => {
      this.connections.delete(connection);
      this.broadcast('players', { players: this.onlinePlayers() });
    });
    // Until the game master app has connected, the phone waits.
    if (this.state) this.sendView(connection);
    else send(res, 'waiting', {});
    this.broadcast('players', { players: this.onlinePlayers() });
  }

  private sendView(connection: Connection): void {
    if (!this.state) return;
    const { player, code } = connection;
    const query = `?code=${encodeURIComponent(code)}&id=${encodeURIComponent(player.id)}`;
    const view = playerView(this.state, player, (revealId) => {
      const at = this.state?.reveals.find((r) => r.id === revealId)?.at ?? '';
      // The time changes the address when the game master replaces an image.
      return `/api/player/images/${encodeURIComponent(revealId)}${query}&v=${encodeURIComponent(at)}`;
    });
    send(connection.res, 'view', view);
  }

  /** Tells a phone with an old or wrong code to ask for the current one, and lets it go. */
  private reject(connection: Connection): void {
    send(connection.res, 'wrong-code', {});
    connection.res.end();
    this.connections.delete(connection);
  }

  private sendImage(res: ServerResponse, revealId: string, url: URL): void {
    const reveal = this.state?.reveals.find((r) => r.id === revealId);
    const id = url.searchParams.get('id') ?? '';
    const allowed =
      reveal?.image &&
      this.state?.code === (url.searchParams.get('code') ?? '').toUpperCase() &&
      canSee(reveal, id);
    const image = allowed && reveal.image ? decodeDataUrl(reveal.image.src) : undefined;
    if (!image) return void res.writeHead(404).end('Not found');
    res.writeHead(200, {
      'Content-Type': image.mimeType,
      'Content-Length': image.bytes.byteLength,
      'Cache-Control': 'private, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
      // An SVG handout must not run scripts in the player app's origin.
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    });
    res.end(image.bytes);
  }

  // --- Apps ----------------------------------------------------------------------------------

  private async serveStatic(
    res: ServerResponse,
    root: string | undefined,
    pathname: string,
  ): Promise<void> {
    if (!root) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return void res.end('The app has not been built. Run "pnpm start" in Lorewarden.');
    }
    const relative = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
    let file = join(root, relative);
    if (file !== root && !file.startsWith(root.endsWith(sep) ? root : root + sep)) {
      return void res.writeHead(403).end('Forbidden');
    }
    const info = await stat(file).catch(() => undefined);
    // Every path the app does not know as a file is the app itself.
    if (!info?.isFile()) file = join(root, 'index.html');
    const found = await stat(file).catch(() => undefined);
    if (!found?.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return void res.end('The app has not been built. Run "pnpm start" in Lorewarden.');
    }
    const isIndex = file.endsWith('index.html');
    res.writeHead(200, {
      'Content-Type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
      'Content-Length': found.size,
      // Built files carry a hash in their name; the page itself must always be fresh.
      'Cache-Control': isIndex ? 'no-cache' : 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
    createReadStream(file).pipe(res);
  }
}

/**
 * Whether a request comes from this computer. The Host check stops a web page that points its own
 * host name at this computer (DNS rebinding), because the browser still sends that name.
 */
function isFromThisComputer(req: IncomingMessage): boolean {
  const host = (req.headers.host ?? '').replace(/:\d+$/, '');
  return LOOPBACK_ADDRESSES.has(req.socket.remoteAddress ?? '') && LOCAL_HOSTS.has(host);
}

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return typeof value === 'string' ? value.slice(0, 64) : undefined;
}

function redirect(res: ServerResponse, location: string): void {
  res.writeHead(302, { Location: location }).end();
}

function sendJson(res: ServerResponse, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function openStream(res: ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), KEEP_ALIVE_MS);
  res.on('close', () => clearInterval(keepAlive));
}

function send(res: ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
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
