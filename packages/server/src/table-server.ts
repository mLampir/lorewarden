import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, sep } from 'node:path';
import {
  canSee,
  DEFAULT_TABLE_PORT,
  decodeDataUrl,
  Player,
  playerView,
  TableState,
} from '@lorewarden/core';

export { DEFAULT_TABLE_PORT };

const MAX_BODY_BYTES = 200 * 1024 * 1024;
const KEEP_ALIVE_MS = 25_000;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

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

export interface TableServerOptions {
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
 * Shows what the game master reveals on the players' phones.
 *
 * Runs on the game master's computer and listens in the local network. The game master app,
 * open in a browser on the same computer, sends the table state and learns who has joined.
 * Phones load the player app from this server and receive only the reveals meant for them.
 * A player needs the join code from the QR code; only this computer may act as the game master.
 */
export class TableServer {
  private state: TableState | undefined;
  private readonly gameMasters = new Set<ServerResponse>();
  private readonly connections = new Set<Connection>();
  private server: Server | undefined;
  private port = DEFAULT_TABLE_PORT;

  constructor(private readonly options: TableServerOptions = {}) {}

  listen(port = DEFAULT_TABLE_PORT, host = '0.0.0.0'): Promise<number> {
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

  /** Addresses at which phones in the local network can reach this server. */
  joinUrls(): string[] {
    const urls: string[] = [];
    for (const addresses of Object.values(networkInterfaces())) {
      for (const address of addresses ?? []) {
        if (address.family === 'IPv4' && !address.internal) {
          urls.push(`http://${address.address}:${this.port}/`);
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
    if (url.pathname.startsWith('/api/gm/')) return this.handleGameMaster(req, res, url);
    if (req.method === 'GET' && url.pathname === '/api/player/events') {
      return this.openPlayerStream(res, url);
    }
    const image = /^\/api\/player\/images\/([^/]+)$/.exec(url.pathname);
    if (req.method === 'GET' && image?.[1]) {
      return this.sendImage(res, decodeURIComponent(image[1]), url);
    }
    if (url.pathname.startsWith('/api/')) return void res.writeHead(404).end('Not found');
    if (req.method === 'GET' || req.method === 'HEAD') return this.serveStatic(res, url.pathname);
    res.writeHead(405).end('Method not allowed');
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

  private async handleGameMaster(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
  ): Promise<void> {
    // Only this computer may act as the game master, and a web page that points its own host
    // name at this computer still sends that name here.
    const host = (req.headers.host ?? '').replace(/:\d+$/, '');
    if (!LOOPBACK_ADDRESSES.has(req.socket.remoteAddress ?? '') || !LOCAL_HOSTS.has(host)) {
      return void res.writeHead(403).end('Only the game master app on this computer may do this');
    }
    const origin = req.headers.origin;
    if (!this.isAllowedOrigin(origin)) return void res.writeHead(403).end('Origin not allowed');
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Methods': 'GET, PUT',
        'Access-Control-Allow-Headers': 'Content-Type',
        // Lets a page on a public origin reach this server in browsers that ask first.
        'Access-Control-Allow-Private-Network': 'true',
      });
      return void res.end();
    }
    if (req.method === 'GET' && url.pathname === '/api/gm/events') {
      return this.openGameMasterStream(res);
    }
    if (req.method === 'PUT' && url.pathname === '/api/gm/state') {
      const parsed = TableState.safeParse(await readJson(req));
      if (!parsed.success) return void res.writeHead(400).end('Invalid table state');
      this.setState(parsed.data);
      return void res.writeHead(204).end();
    }
    res.writeHead(404).end('Not found');
  }

  private openGameMasterStream(res: ServerResponse): void {
    openStream(res);
    this.gameMasters.add(res);
    send(res, 'table', { joinUrls: this.joinUrls(), players: this.onlinePlayers() });
    res.on('close', () => this.gameMasters.delete(res));
  }

  private notifyGameMasters(): void {
    for (const res of this.gameMasters) send(res, 'players', { players: this.onlinePlayers() });
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
      this.notifyGameMasters();
    });
    // Until the game master app has connected, the phone waits.
    if (this.state) this.sendView(connection);
    else send(res, 'waiting', {});
    this.notifyGameMasters();
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

  // --- Player app ----------------------------------------------------------------------------

  private async serveStatic(res: ServerResponse, pathname: string): Promise<void> {
    const root = this.options.playerDir;
    if (!root) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return void res.end('The player app has not been built. Run "pnpm table" in Lorewarden.');
    }
    const relative = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
    let file = join(root, relative);
    if (file !== root && !file.startsWith(root.endsWith(sep) ? root : root + sep)) {
      return void res.writeHead(403).end('Forbidden');
    }
    const info = await stat(file).catch(() => undefined);
    // Every path the app does not know as a file is the app itself.
    if (!info?.isFile()) file = join(root, 'index.html');
    const index = await stat(file).catch(() => undefined);
    if (!index?.isFile()) return void res.writeHead(404).end('Not found');
    const isIndex = file.endsWith('index.html');
    res.writeHead(200, {
      'Content-Type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
      'Content-Length': index.size,
      // Built files carry a hash in their name; the page itself must always be fresh.
      'Cache-Control': isIndex ? 'no-cache' : 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
    createReadStream(file).pipe(res);
  }
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
