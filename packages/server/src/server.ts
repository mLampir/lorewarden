import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, sep } from 'node:path';
import {
  Adventure,
  AiSettings,
  canSee,
  DEFAULT_SERVER_PORT,
  decodeDataUrl,
  Player,
  playerView,
  Session,
  TableState,
} from '@lorewarden/core';
import { type Auth, MAX_PASSWORD_LENGTH, passwordProblem, SESSION_DAYS } from './auth';
import { Attempts, clientAddress } from './limits';
import type { Store } from './store';
import type { UpdateInfo } from './updates';

export { DEFAULT_SERVER_PORT };

const MAX_BODY_BYTES = 200 * 1024 * 1024;
const MAX_AUTH_BODY_BYTES = 4 * MAX_PASSWORD_LENGTH;
/** More phones than any table has; keeps strangers from holding the server's connections. */
const MAX_PLAYER_CONNECTIONS = 200;
const SESSION_COOKIE = 'lorewarden_session';
/**
 * Sent with every answer. The apps load only their own scripts; images and handouts come as
 * data: or blob: addresses.
 */
const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; " +
    "font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; " +
    "frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
};
const KEEP_ALIVE_MS = 25_000;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const PROXY_HEADERS = ['x-forwarded-for', 'x-real-ip', 'x-forwarded-proto', 'forwarded'];
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
  /** The version this server runs, shown in the game master app. */
  version?: string;
  /** The game master's password and sessions. Without it, only this computer is let in. */
  auth?: Auth;
  /** Count the client address a reverse proxy passes on (X-Real-IP, X-Forwarded-For). */
  trustProxy?: boolean;
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
  private settings: AiSettings = {};
  private readonly gameMasters = new Set<ServerResponse>();
  private readonly connections = new Set<Connection>();
  private server: Server | undefined;
  private port = DEFAULT_SERVER_PORT;
  private update: UpdateInfo;
  /** Wrong passwords and setup links. */
  private readonly signIns = new Attempts(5, 15 * 60_000);
  /** Wrong join codes. */
  private readonly joins = new Attempts(20, 15 * 60_000);

  constructor(private readonly options: ServerOptions) {
    this.update = { current: options.version ?? 'dev' };
  }

  listen(port = DEFAULT_SERVER_PORT, host = '0.0.0.0'): Promise<number> {
    const server = createServer((req, res) => {
      this.handle(req, res).catch((error: unknown) => {
        console.error(error);
        if (!res.headersSent) res.writeHead(500).end('Internal error');
        else res.end();
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
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
    if (req.method === 'GET' && pathname === '/api/player/events') {
      return this.openPlayerStream(req, res, url);
    }
    const image = /^\/api\/player\/images\/([^/]+)$/.exec(pathname);
    if (req.method === 'GET' && image?.[1]) {
      return this.sendImage(req, res, decodeURIComponent(image[1]), url);
    }
    if (pathname.startsWith('/api/auth/')) {
      if (!this.admitOrigin(req, res)) return;
      return this.handleAuth(req, res, pathname);
    }
    if (pathname.startsWith('/api/')) {
      if (!this.admitOrigin(req, res)) return;
      if (!this.hasAccess(req)) {
        return void res.writeHead(401).end('Sign in to Lorewarden first');
      }
      return this.handleGameMaster(req, res, pathname);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return void res.writeHead(405).end('Method not allowed');
    }
    if (pathname === '/play') return redirect(res, PLAYER_PATH);
    if (pathname.startsWith(PLAYER_PATH)) {
      return this.serveStatic(res, this.options.playerDir, pathname.slice(PLAYER_PATH.length));
    }
    // With a password, the game master app is open to everyone: it asks for the password before
    // it shows anything. Without one, other computers get it only for the setup link.
    if (isFromThisComputer(req) || this.hasPassword || pathname === '/setup') {
      return this.serveStatic(res, this.options.gmDir, pathname);
    }
    // Phones that open the bare address land in the player app. The setup page still needs the
    // app's own files; a file that is not there is missing, not a page.
    if (extname(pathname)) return this.serveStatic(res, this.options.gmDir, pathname, false);
    return redirect(res, PLAYER_PATH);
  }

  // --- Signing in ----------------------------------------------------------------------------

  private get hasPassword(): boolean {
    return this.options.auth?.hasPassword ?? false;
  }

  /** Whether a request may act as the game master. */
  private hasAccess(req: IncomingMessage): boolean {
    const { auth } = this.options;
    const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
    if (auth && bearer) return auth.checkToken(bearer);
    if (!this.hasPassword) return isFromThisComputer(req);
    return auth?.hasSession(sessionCookie(req)) ?? false;
  }

  private async handleAuth(
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string,
  ): Promise<void> {
    const { auth } = this.options;
    const method = req.method;
    if (method === 'GET' && pathname === '/api/auth/status') {
      return sendJson(res, {
        access: this.hasAccess(req),
        password: auth?.source ?? 'none',
        local: isFromThisComputer(req),
      });
    }
    if (!auth || method !== 'POST') return void res.writeHead(404).end('Not found');

    if (pathname === '/api/auth/logout') {
      auth.endSession(sessionCookie(req));
      res.setHeader(
        'Set-Cookie',
        `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`,
      );
      return void res.writeHead(204).end();
    }

    const client = clientAddress(req, this.options.trustProxy ?? false);
    const wait = this.signIns.retryAfter(client);
    if (wait > 0) {
      return void res.writeHead(429, { 'Retry-After': String(wait) }).end('Too many attempts');
    }
    const body = (await readJson(req, MAX_AUTH_BODY_BYTES)) as Record<string, unknown> | undefined;
    const field = (name: string) => (typeof body?.[name] === 'string' ? body[name] : '');

    if (pathname === '/api/auth/login') {
      if (!auth.hasPassword || !(await auth.verify(field('password')))) {
        this.signIns.fail(client);
        return void res.writeHead(403).end('Wrong password');
      }
      return this.signIn(req, res, auth);
    }

    if (pathname === '/api/auth/setup') {
      if (auth.hasPassword) return void res.writeHead(409).end('There is a password already');
      // On this computer no setup link is needed, as before there was a password.
      if (!isFromThisComputer(req) && !auth.checkSetupToken(field('token'))) {
        this.signIns.fail(client);
        return void res.writeHead(403).end('Wrong setup link');
      }
      const problem = passwordProblem(body?.password);
      if (problem) return void res.writeHead(400).end(`Password too ${problem}`);
      await auth.setPassword(field('password'));
      return this.signIn(req, res, auth);
    }

    if (pathname === '/api/auth/password') {
      if (auth.source !== 'settings' || !this.hasAccess(req)) {
        return void res.writeHead(403).end('The password cannot be changed here');
      }
      if (!(await auth.verify(field('current')))) {
        this.signIns.fail(client);
        return void res.writeHead(403).end('Wrong password');
      }
      const problem = passwordProblem(body?.password);
      if (problem) return void res.writeHead(400).end(`Password too ${problem}`);
      await auth.setPassword(field('password'));
      // Every other browser is signed out, including open game master apps.
      for (const stream of this.gameMasters) stream.end();
      return this.signIn(req, res, auth);
    }
    res.writeHead(404).end('Not found');
  }

  private signIn(req: IncomingMessage, res: ServerResponse, auth: Auth): void {
    // Behind an HTTPS proxy the browser talks HTTPS even though this server does not.
    const https =
      req.headers['x-forwarded-proto'] === 'https' ||
      (req.headers.origin ?? '').startsWith('https:');
    const cookie = [
      `${SESSION_COOKIE}=${auth.createSession()}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Strict',
      `Max-Age=${SESSION_DAYS * 86_400}`,
      ...(https ? ['Secure'] : []),
    ].join('; ');
    res.writeHead(204, { 'Set-Cookie': cookie }).end();
  }

  // --- Game master ---------------------------------------------------------------------------

  private isAllowedOrigin(req: IncomingMessage): boolean {
    const origin = req.headers.origin;
    // Requests without an origin come from programs or from the app's own page, not from
    // another web page.
    if (origin === undefined) return true;
    if (this.options.allowedOrigins?.includes(origin)) return true;
    try {
      const { hostname, host } = new URL(origin);
      // The app served by this server, also behind a reverse proxy that passes the host name on.
      return (
        LOCAL_HOSTS.has(hostname) || host === req.headers.host || hostname === req.headers.host
      );
    } catch {
      return false;
    }
  }

  /** Turns away other web pages; answers CORS preflights. */
  private admitOrigin(req: IncomingMessage, res: ServerResponse): boolean {
    const origin = req.headers.origin;
    if (!this.isAllowedOrigin(req)) {
      res.writeHead(403).end('Origin not allowed');
      return false;
    }
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE',
        'Access-Control-Allow-Headers': 'Content-Type, X-Lorewarden-Client, Authorization',
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

    // AI assistants ask which session is being played and in which languages to write.
    if (method === 'GET' && pathname === '/api/sessions/current') {
      const session = await store.currentSession();
      return session ? sendJson(res, session) : void res.writeHead(404).end('No session');
    }
    if (pathname === '/api/settings') {
      if (method === 'GET') return sendJson(res, this.settings);
      if (method !== 'PUT') return void res.writeHead(405).end('Method not allowed');
      const parsed = AiSettings.safeParse(await readJson(req));
      if (!parsed.success) return void res.writeHead(400).end('Invalid settings');
      this.settings = parsed.data;
      return void res.writeHead(204).end();
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
      update: this.update,
    });
    res.on('close', () => this.gameMasters.delete(res));
  }

  /** Tells the game master app that a newer release is out. */
  setUpdate(update: UpdateInfo): void {
    this.update = update;
    this.broadcast('update', update);
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

  private openPlayerStream(req: IncomingMessage, res: ServerResponse, url: URL): void {
    const client = clientAddress(req, this.options.trustProxy ?? false);
    const wait = this.joins.retryAfter(client);
    if (wait > 0) {
      return void res.writeHead(429, { 'Retry-After': String(wait) }).end('Too many attempts');
    }
    if (this.connections.size >= MAX_PLAYER_CONNECTIONS) {
      return void res.writeHead(503).end('Too many players');
    }
    const parsed = Player.safeParse({
      id: url.searchParams.get('id'),
      name: url.searchParams.get('name'),
    });
    const code = (url.searchParams.get('code') ?? '').toUpperCase();
    if (!parsed.success || code === '') return void res.writeHead(400).end('Invalid player');
    openStream(res);
    const connection: Connection = { player: parsed.data, code, res };
    if (this.state && this.state.code !== code) {
      this.joins.fail(client);
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

  private sendImage(req: IncomingMessage, res: ServerResponse, revealId: string, url: URL): void {
    const client = clientAddress(req, this.options.trustProxy ?? false);
    if (this.joins.retryAfter(client) > 0) return void res.writeHead(429).end('Too many attempts');
    const reveal = this.state?.reveals.find((r) => r.id === revealId);
    const id = url.searchParams.get('id') ?? '';
    const rightCode = this.state?.code === (url.searchParams.get('code') ?? '').toUpperCase();
    if (this.state && !rightCode) this.joins.fail(client);
    const allowed = reveal?.image && rightCode && canSee(reveal, id);
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
    /** Answer paths that are no file with the app, which shows its own pages. */
    asApp = true,
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
    if (!info?.isFile() && !asApp) return void res.writeHead(404).end('Not found');
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
 * host name at this computer (DNS rebinding), because the browser still sends that name. A
 * request a reverse proxy passed on comes from elsewhere, even if it claims "localhost".
 */
function isFromThisComputer(req: IncomingMessage): boolean {
  const host = (req.headers.host ?? '').replace(/:\d+$/, '');
  const proxied = PROXY_HEADERS.some((name) => req.headers[name] !== undefined);
  return (
    LOOPBACK_ADDRESSES.has(req.socket.remoteAddress ?? '') && LOCAL_HOSTS.has(host) && !proxied
  );
}

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return typeof value === 'string' ? value.slice(0, 64) : undefined;
}

function sessionCookie(req: IncomingMessage): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === SESSION_COOKIE) return value.join('=');
  }
  return undefined;
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

async function readJson(req: IncomingMessage, maxBytes = MAX_BODY_BYTES): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > maxBytes) throw new Error('Request body too large');
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return undefined;
  }
}
