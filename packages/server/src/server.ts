import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, sep } from 'node:path';
import { pipeline } from 'node:stream';
import {
  Adventure,
  AiSettings,
  applySignUp,
  canSee,
  DEFAULT_SERVER_PORT,
  decodeDataUrl,
  Monster,
  Party,
  Player,
  PlayerInitiative,
  playerView,
  Session,
  SignUpRequest,
  signUpView,
  TableState,
  tableInfo,
} from '@lorewarden/core';
import { type Auth, MAX_PASSWORD_LENGTH, passwordProblem, SESSION_DAYS } from './auth';
import { Attempts, clientAddress } from './limits';
import { type AuthorizationRequest, type OAuth, OAuthError } from './oauth';
import type { Store } from './store';
import type { Updater } from './updater';
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
  '.woff2': 'font/woff2',
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
  /** Lets AI assistants connect to the MCP endpoint by signing in with OAuth. */
  oauth?: OAuth;
  /** Answers MCP requests at /mcp, see mcp.ts. */
  mcp?: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  /** The address people use, e.g. https://lorewarden.example.org. Taken from requests if unset. */
  publicUrl?: string;
  /** The optional updater container, which updates this server when asked. */
  updater?: Updater;
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
  /** OAuth registrations, which anyone may make. */
  private readonly registrations = new Attempts(10, 60 * 60_000);

  constructor(private readonly options: ServerOptions) {
    this.update = { current: options.version ?? 'dev' };
  }

  listen(port = DEFAULT_SERVER_PORT, host = '0.0.0.0'): Promise<number> {
    const server = createServer((req, res) => {
      this.handle(req, res).catch((error: unknown) => {
        if (error instanceof HttpError) {
          if (!res.headersSent) res.writeHead(error.status, { Connection: 'close' });
          return void res.end(error.message);
        }
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
    if (pathname === '/api/player/initiative') return this.receiveInitiative(req, res);
    if (req.method === 'GET' && pathname === '/api/player/table') {
      return this.sendTableInfo(req, res, url);
    }
    if (pathname === '/api/player/signup') return this.handleSignUp(req, res, url);
    if (req.method === 'GET' && pathname === '/api/player/seat') {
      return this.sendSeat(req, res, url);
    }
    const image = /^\/api\/player\/images\/([^/]+)$/.exec(pathname);
    if (req.method === 'GET' && image?.[1]) {
      return this.sendImage(req, res, decodePart(image[1]), url);
    }
    if (pathname.startsWith('/.well-known/oauth-') || pathname.startsWith('/oauth/')) {
      if (pathname !== '/oauth/authorize') return this.handleOAuth(req, res, pathname);
    }
    if (pathname === '/mcp') return this.handleMcp(req, res);
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
    // The query keeps the join code or the sign-up code of the link.
    if (pathname === '/play') return redirect(res, PLAYER_PATH + url.search);
    if (pathname.startsWith(PLAYER_PATH)) {
      return this.serveStatic(res, this.options.playerDir, pathname.slice(PLAYER_PATH.length));
    }
    // With a password, the game master app is open to everyone: it asks for the password before
    // it shows anything. Without one, other computers get it only for the setup link.
    if (
      isFromThisComputer(req) ||
      this.hasPassword ||
      pathname === '/setup' ||
      pathname === '/oauth/authorize'
    ) {
      return this.serveStatic(res, this.options.gmDir, pathname);
    }
    // Phones that open the bare address land in the player app. The setup page still needs the
    // app's own files; a file that is not there is missing, not a page.
    if (extname(pathname)) return this.serveStatic(res, this.options.gmDir, pathname, false);
    return redirect(res, PLAYER_PATH + url.search);
  }

  // --- AI assistants -------------------------------------------------------------------------

  /** Where people reach this server, for the addresses in the OAuth metadata. */
  private publicUrl(req: IncomingMessage): string {
    if (this.options.publicUrl) return this.options.publicUrl.replace(/\/+$/, '');
    const https =
      req.headers['x-forwarded-proto'] === 'https' ||
      (req.headers.origin ?? '').startsWith('https:');
    return `${https ? 'https' : 'http'}://${req.headers.host ?? 'localhost'}`;
  }

  private async handleMcp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const { mcp, oauth, auth } = this.options;
    if (!mcp) return void res.writeHead(404).end('Not found');
    const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1] ?? '';
    const allowed =
      (oauth?.checkAccessToken(bearer) && this.hasPassword) || (auth?.checkToken(bearer) ?? false);
    if (!allowed) {
      // Tells the AI assistant where to sign in (RFC 9728).
      const metadata = `${this.publicUrl(req)}/.well-known/oauth-protected-resource/mcp`;
      res.writeHead(401, { 'WWW-Authenticate': `Bearer resource_metadata="${metadata}"` });
      return void res.end('Connect the AI assistant to Lorewarden first');
    }
    return mcp(req, res);
  }

  /** OAuth metadata, client registration and tokens, used by AI assistants, not browsers. */
  private async handleOAuth(
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string,
  ): Promise<void> {
    const { oauth } = this.options;
    if (!oauth || !this.options.mcp) return void res.writeHead(404).end('Not found');
    // AI assistants in a browser (e.g. MCP Inspector) read these from another origin.
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Methods': 'GET, POST',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, MCP-Protocol-Version',
      });
      return void res.end();
    }
    const base = this.publicUrl(req);
    if (req.method === 'GET' && pathname.startsWith('/.well-known/oauth-protected-resource')) {
      return sendJson(res, {
        resource: `${base}/mcp`,
        authorization_servers: [base],
        bearer_methods_supported: ['header'],
        resource_name: 'Lorewarden',
      });
    }
    if (req.method === 'GET' && pathname.startsWith('/.well-known/oauth-authorization-server')) {
      return sendJson(res, {
        issuer: base,
        authorization_endpoint: `${base}/oauth/authorize`,
        token_endpoint: `${base}/oauth/token`,
        registration_endpoint: `${base}/oauth/register`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none'],
      });
    }
    if (req.method !== 'POST') return void res.writeHead(404).end('Not found');
    const client = clientAddress(req, this.options.trustProxy ?? false);
    try {
      if (pathname === '/oauth/register') {
        if (this.registrations.retryAfter(client) > 0) {
          throw new OAuthError('temporarily_unavailable', 'Too many registrations');
        }
        this.registrations.fail(client);
        const registered = oauth.register(await readJson(req, 64 * 1024));
        return sendJson(
          res,
          {
            client_id: registered.id,
            client_id_issued_at: Math.floor(registered.created / 1000),
            client_name: registered.name,
            redirect_uris: registered.redirectUris,
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            token_endpoint_auth_method: 'none',
          },
          201,
        );
      }
      if (pathname === '/oauth/token') {
        return sendJson(res, oauth.token(await readForm(req)));
      }
    } catch (error) {
      if (!(error instanceof OAuthError)) throw error;
      return sendJson(res, { error: error.code, error_description: error.message }, 400);
    }
    res.writeHead(404).end('Not found');
  }

  /** The authorization page in the app asks what to allow and passes on the decision. */
  private async handleAuthorization(
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string,
  ): Promise<void> {
    const { oauth } = this.options;
    if (!oauth || !this.options.mcp) return void res.writeHead(404).end('Not found');
    if (pathname === '/api/oauth/connections') {
      if (req.method === 'GET') return sendJson(res, { connected: oauth.connected });
      if (req.method === 'DELETE') {
        oauth.revokeAll();
        return void res.writeHead(204).end();
      }
    }
    if (req.method !== 'POST') return void res.writeHead(405).end('Method not allowed');
    const body = (await readJson(req, 16 * 1024)) as Record<string, unknown> | undefined;
    const params = new URLSearchParams(typeof body?.query === 'string' ? body.query : '');
    let request: AuthorizationRequest & { clientName: string };
    try {
      request = oauth.check(params);
    } catch (error) {
      if (!(error instanceof OAuthError)) throw error;
      return sendJson(res, { error: error.code, error_description: error.message }, 400);
    }
    if (pathname === '/api/oauth/check') {
      return sendJson(res, {
        clientName: request.clientName,
        redirectHost: new URL(request.redirectUri).host,
        // Without a password, nobody away from this computer can use what the app allows.
        needsPassword: !this.hasPassword,
      });
    }
    if (pathname === '/api/oauth/decide') {
      const allow = body?.allow === true && this.hasPassword;
      return sendJson(res, { redirect: allow ? oauth.approve(request) : oauth.deny(request) });
    }
    res.writeHead(404).end('Not found');
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
      const undo = reserve(this.signIns, client, res);
      if (!undo) return;
      if (!auth.hasPassword || !(await auth.verify(field('password')))) {
        return void res.writeHead(403).end('Wrong password');
      }
      undo();
      return this.signIn(req, res, auth);
    }

    if (pathname === '/api/auth/setup') {
      if (auth.hasPassword) return void res.writeHead(409).end('There is a password already');
      // On this computer no setup link is needed, as before there was a password.
      if (!isFromThisComputer(req)) {
        const undo = reserve(this.signIns, client, res);
        if (!undo) return;
        if (!auth.checkSetupToken(field('token'))) {
          return void res.writeHead(403).end('Wrong setup link');
        }
        undo();
      }
      const problem = passwordProblem(body?.password);
      if (problem) return void res.writeHead(400).end(`Password too ${problem}`);
      await auth.setPassword(field('password'));
      this.options.oauth?.revokeAll();
      return this.signIn(req, res, auth);
    }

    if (pathname === '/api/auth/password') {
      if (auth.source !== 'settings' || !this.hasAccess(req)) {
        return void res.writeHead(403).end('The password cannot be changed here');
      }
      const undo = reserve(this.signIns, client, res);
      if (!undo) return;
      if (!(await auth.verify(field('current')))) {
        return void res.writeHead(403).end('Wrong password');
      }
      undo();
      const problem = passwordProblem(body?.password);
      if (problem) return void res.writeHead(400).end(`Password too ${problem}`);
      await auth.setPassword(field('password'));
      // Every other browser is signed out, including open game master apps.
      for (const stream of this.gameMasters) stream.end();
      this.options.oauth?.revokeAll();
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
    if (pathname.startsWith('/api/oauth/')) return this.handleAuthorization(req, res, pathname);
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
    const id = adventureMatch?.[1] ? decodePart(adventureMatch[1]) : undefined;
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

    if (method === 'GET' && pathname === '/api/monsters') {
      return sendJson(res, await store.monsters());
    }
    const monsterMatch = /^\/api\/monsters\/([^/]+)$/.exec(pathname);
    const monsterId = monsterMatch?.[1] ? decodePart(monsterMatch[1]) : undefined;
    if (monsterId && method === 'PUT') {
      const parsed = Monster.safeParse(await readJson(req));
      if (!parsed.success || parsed.data.id !== monsterId) {
        return void res.writeHead(400).end('Invalid monster');
      }
      await store.saveMonster(parsed.data);
      this.broadcast('monsters', { client });
      return void res.writeHead(204).end();
    }
    if (monsterId && method === 'DELETE') {
      const deleted = await store.deleteMonster(monsterId);
      if (deleted) this.broadcast('monsters', { client });
      return void res.writeHead(deleted ? 204 : 404).end();
    }

    if (method === 'GET' && pathname === '/api/parties') {
      return sendJson(res, await store.parties());
    }
    const partyMatch = /^\/api\/parties\/([^/]+)$/.exec(pathname);
    const partyId = partyMatch?.[1] ? decodePart(partyMatch[1]) : undefined;
    if (partyId && method === 'PUT') {
      const parsed = Party.safeParse(await readJson(req));
      if (!parsed.success || parsed.data.id !== partyId) {
        return void res.writeHead(400).end('Invalid party');
      }
      await store.saveParty(parsed.data);
      this.broadcast('parties', { client });
      return void res.writeHead(204).end();
    }
    if (partyId && method === 'DELETE') {
      const deleted = await store.deleteParty(partyId);
      if (deleted) this.broadcast('parties', { client });
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

    if (pathname.startsWith('/api/updater/')) return this.handleUpdater(req, res, pathname);

    const sessionMatch = /^\/api\/sessions\/([^/]+)$/.exec(pathname);
    if (sessionMatch?.[1] && method === 'PUT') {
      const parsed = Session.safeParse(await readJson(req));
      if (!parsed.success || parsed.data.id !== decodePart(sessionMatch[1])) {
        return void res.writeHead(400).end('Invalid session');
      }
      await store.saveSession(parsed.data);
      return void res.writeHead(204).end();
    }
    res.writeHead(404).end('Not found');
  }

  /** The update button and the automatic updates in the settings. */
  private async handleUpdater(
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string,
  ): Promise<void> {
    const { updater } = this.options;
    if (!updater) return void res.writeHead(404).end('No updater is set up');
    if (req.method === 'POST' && pathname === '/api/updater/update') {
      const result = await updater.start();
      const status = { started: 202, busy: 409, unreachable: 502 }[result];
      return void res.writeHead(status).end();
    }
    if (req.method === 'PUT' && pathname === '/api/updater/settings') {
      const body = (await readJson(req, 1024)) as Record<string, unknown> | undefined;
      if (typeof body?.auto !== 'boolean') return void res.writeHead(400).end('Invalid settings');
      updater.setAuto(body.auto);
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
      updater: this.options.updater?.info,
    });
    res.on('close', () => this.gameMasters.delete(res));
  }

  /** Tells the game master app that a newer release is out. */
  setUpdate(update: UpdateInfo): void {
    this.update = update;
    this.broadcast('update', update);
  }

  /** The newest release, when it is newer than this server's version. */
  get latestRelease(): string | undefined {
    return this.update.latest;
  }

  /** Tells the game master app what the updater container is doing. */
  updaterChanged(): void {
    this.broadcast('updater', this.options.updater?.info);
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
    // Only a character of the adventure's party can be picked.
    const characterId = url.searchParams.get('character') ?? '';
    const known = this.state?.characters?.some((c) => c.id === characterId);
    const parsed = Player.safeParse({
      id: url.searchParams.get('id'),
      name: url.searchParams.get('name'),
      ...(known ? { characterId } : {}),
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
    // Rules terms on the phone follow the language the game master chose for them.
    const { termsLanguage } = this.settings;
    send(connection.res, 'view', { ...view, ...(termsLanguage ? { termsLanguage } : {}) });
  }

  /**
   * Passes the initiative a player entered on to the game master app, which puts it into the
   * initiative list. Only phones that are connected with the current code may send one, and only
   * while the game master asks for it.
   */
  private async receiveInitiative(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') return void res.writeHead(405).end('Method not allowed');
    // JSON makes browsers ask first before another site's page can send it.
    if (!(req.headers['content-type'] ?? '').startsWith('application/json')) {
      return void res.writeHead(415).end('Send JSON');
    }
    const client = clientAddress(req, this.options.trustProxy ?? false);
    if (this.joins.retryAfter(client) > 0) return void res.writeHead(429).end('Too many attempts');
    const parsed = PlayerInitiative.safeParse(await readJson(req, 1024));
    // Looked at again: requests sent at the same time all got past the first look.
    if (this.joins.retryAfter(client) > 0) return void res.writeHead(429).end('Too many attempts');
    if (!parsed.success) return void res.writeHead(400).end('Invalid initiative');
    const { code, id, value } = parsed.data;
    if (!this.state || this.state.code !== code) {
      this.joins.fail(client);
      return void res.writeHead(403).end('Wrong code');
    }
    const connection = [...this.connections].find((c) => c.player.id === id && c.code === code);
    if (!connection) return void res.writeHead(403).end('Join the table first');
    if (!this.state.initiative) return void res.writeHead(409).end('Not asking for initiative');
    this.broadcast('initiative', { player: connection.player, value });
    res.writeHead(204).end();
  }

  /** Tells a phone before it joins which characters it can pick. */
  private sendTableInfo(req: IncomingMessage, res: ServerResponse, url: URL): void {
    const client = clientAddress(req, this.options.trustProxy ?? false);
    if (this.joins.retryAfter(client) > 0) return void res.writeHead(429).end('Too many attempts');
    if (!this.state) return void res.writeHead(409).end('No table yet');
    if (this.state.code !== (url.searchParams.get('code') ?? '').toUpperCase()) {
      this.joins.fail(client);
      return void res.writeHead(403).end('Wrong code');
    }
    sendJson(res, tableInfo(this.state, this.onlinePlayers()));
  }

  /**
   * Lets players enter their characters from their phones while the game master has the sign-up
   * for that party open. A phone can change only the characters it entered itself.
   */
  private async handleSignUp(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const client = clientAddress(req, this.options.trustProxy ?? false);
    const wait = this.joins.retryAfter(client);
    if (wait > 0) {
      return void res.writeHead(429, { 'Retry-After': String(wait) }).end('Too many attempts');
    }
    const { store } = this.options;
    const signUpOpen = async (code: string) => {
      // Counted before the parties are read, so guesses sent at the same time are counted too.
      const undo = this.joins.reserve(client);
      const { parties } = await store.parties();
      const party = parties.find((p) => p.signUpCode !== undefined && p.signUpCode === code);
      if (party) undo();
      return party;
    };
    if (req.method === 'GET') {
      const id = url.searchParams.get('id') ?? '';
      if (id === '' || id.length > 64) return void res.writeHead(400).end('Invalid player');
      const party = await signUpOpen((url.searchParams.get('code') ?? '').toUpperCase());
      if (!party) return void res.writeHead(403).end('Sign-up is closed');
      return sendJson(res, await this.signUpView(party, id));
    }
    if (req.method !== 'POST') return void res.writeHead(405).end('Method not allowed');
    // JSON makes browsers ask first before another site's page can send it.
    if (!(req.headers['content-type'] ?? '').startsWith('application/json')) {
      return void res.writeHead(415).end('Send JSON');
    }
    const parsed = SignUpRequest.safeParse(await readJson(req, 16 * 1024));
    if (this.joins.retryAfter(client) > 0) return void res.writeHead(429).end('Too many attempts');
    if (!parsed.success) return void res.writeHead(400).end('Invalid character');
    const { code, id } = parsed.data;
    if (!(await signUpOpen(code))) return void res.writeHead(403).end('Sign-up is closed');
    let characterId: string | undefined;
    const party = await store.changeParty(
      (p) => p.signUpCode === code,
      (p) => {
        const result = applySignUp(p, id, parsed.data);
        characterId = result?.characterId;
        return result?.party;
      },
    );
    if (!party || !characterId) return void res.writeHead(403).end('Not allowed');
    this.broadcast('parties', {});
    sendJson(res, { characterId, view: await this.signUpView(party, id) });
  }

  /** The sign-up screen with rules terms in the language the game master chose for them. */
  private async signUpView(party: Party, playerId: string) {
    const { termsLanguage } = this.settings;
    const atTable = (await this.seatOf(playerId)) !== undefined;
    return {
      ...signUpView(party, playerId),
      ...(termsLanguage ? { termsLanguage } : {}),
      ...(atTable ? { atTable } : {}),
    };
  }

  /**
   * The character a phone entered in the party the game master is playing with right now, if
   * any. Such a phone may join without scanning the table's code: the player id it entered the
   * character with is a random secret only that phone knows.
   */
  private async seatOf(
    playerId: string,
  ): Promise<{ code: string; characterId: string; name: string } | undefined> {
    const atTable = this.state?.characters;
    if (!this.state || !atTable || playerId === '') return undefined;
    const { parties } = await this.options.store.parties();
    for (const party of parties) {
      const own = party.characters.find(
        (c) => c.ownerId === playerId && atTable.some((t) => t.id === c.id),
      );
      if (own) return { code: this.state.code, characterId: own.id, name: own.name };
    }
    return undefined;
  }

  /**
   * Lets a phone that entered a character of the party at the table join it directly. No answer
   * when there is none, which phones ask for again while they wait, so it does not count as a
   * failed attempt.
   */
  private async sendSeat(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const client = clientAddress(req, this.options.trustProxy ?? false);
    if (this.joins.retryAfter(client) > 0) return void res.writeHead(429).end('Too many attempts');
    const id = url.searchParams.get('id') ?? '';
    if (id.length > 64) return void res.writeHead(400).end('Invalid player');
    const seat = await this.seatOf(id);
    if (!seat) return void res.writeHead(204).end();
    sendJson(res, seat);
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
    const relative = normalize(decodePart(pathname)).replace(/^([/\\])+/, '');
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
    // The file may vanish or be unreadable after the look above; that must not stop the server.
    pipeline(createReadStream(file), res, (error) => {
      if (error) res.destroy();
    });
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

/**
 * Counts an attempt before it is checked; the limit is looked at again here because the request
 * body was read since the first look. Answers 429 and returns undefined when the client has to
 * wait, else a function that takes the attempt back when it turns out right.
 */
function reserve(
  attempts: Attempts,
  client: string,
  res: ServerResponse,
): (() => void) | undefined {
  const wait = attempts.retryAfter(client);
  if (wait > 0) {
    res.writeHead(429, { 'Retry-After': String(wait) }).end('Too many attempts');
    return undefined;
  }
  return attempts.reserve(client);
}

/** Ends a request with an answer for the client; not an error of the server, so not logged. */
class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Decodes a part of the address; a broken %-escape is the client's mistake. */
function decodePart(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    throw new HttpError(400, 'Invalid address');
  }
}

function redirect(res: ServerResponse, location: string): void {
  res.writeHead(302, { Location: location }).end();
}

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
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
    if (size > maxBytes) throw new HttpError(413, 'Request body too large');
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return undefined;
  }
}

/** A form body such as the OAuth token request; JSON is accepted too. */
async function readForm(req: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 16 * 1024) throw new OAuthError('invalid_request', 'Request body too large');
    chunks.push(chunk as Buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!(req.headers['content-type'] ?? '').includes('json')) return new URLSearchParams(text);
  try {
    const data = JSON.parse(text) as Record<string, unknown>;
    return new URLSearchParams(
      Object.entries(data).flatMap(([key, value]) =>
        typeof value === 'string' ? [[key, value] as [string, string]] : [],
      ),
    );
  } catch {
    throw new OAuthError('invalid_request', 'Invalid JSON');
  }
}
