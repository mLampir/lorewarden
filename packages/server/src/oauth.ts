import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AUTH_DIR } from './auth';

const OAUTH_FILE = 'oauth.json';
const CODE_MS = 5 * 60_000;
/** How long a used code is remembered, so that using it again revokes its tokens. */
const USED_CODE_MS = 24 * 60 * 60_000;
const ACCESS_MS = 60 * 60_000;
const REFRESH_MS = 90 * 86_400_000;
/**
 * Registrations are free for anyone, so only this many are kept. A flood of new ones pushes out
 * the oldest that never got a token first, not the apps in use.
 */
const MAX_CLIENTS = 50;
const MAX_GRANTS = 50;

/** An app that registered itself, such as Claude, see RFC 7591. */
export interface OAuthClient {
  id: string;
  name: string;
  redirectUris: string[];
  created: number;
  /** When the app last got tokens; never, for a registration nobody allowed. */
  used?: number;
}

interface Grant {
  clientId: string;
  /** SHA-256 of the tokens; the tokens themselves are never kept. */
  access: string;
  accessExpires: number;
  refresh: string;
  refreshExpires: number;
  /** The code the first tokens came from, kept through refreshes (its SHA-256). */
  code?: string;
}

interface OAuthFile {
  clients: OAuthClient[];
  grants: Grant[];
}

/** What the game master is asked to allow. */
export interface AuthorizationRequest {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state?: string;
}

interface PendingCode extends AuthorizationRequest {
  expires: number;
  /** Set once the code was presented at the token endpoint; it never works again. */
  used?: true;
}

export interface Tokens {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
}

export class OAuthError extends Error {
  constructor(
    readonly code: string,
    description: string,
  ) {
    super(description);
  }
}

/**
 * Lets AI assistants such as Claude connect to Lorewarden's MCP endpoint without a token in
 * their configuration: they register themselves, the game master allows them once in the app
 * (OAuth 2.1 with PKCE), and they get tokens that only open the MCP endpoint.
 */
export class OAuth {
  private file: OAuthFile = { clients: [], grants: [] };
  private fileTime = -1;
  private readonly codes = new Map<string, PendingCode>();
  private readonly path: string;

  constructor(dataDir: string) {
    this.path = join(dataDir, AUTH_DIR, OAUTH_FILE);
    this.refresh();
  }

  register(body: unknown): OAuthClient {
    this.refresh();
    const input = (typeof body === 'object' && body !== null ? body : {}) as Record<
      string,
      unknown
    >;
    const uris = Array.isArray(input.redirect_uris) ? input.redirect_uris : [];
    if (uris.length === 0 || uris.length > 10 || !uris.every(isRedirectUri)) {
      throw new OAuthError('invalid_redirect_uri', 'Give one to ten https redirect URIs');
    }
    const name =
      typeof input.client_name === 'string' && input.client_name.trim()
        ? input.client_name.trim().slice(0, 80)
        : 'AI assistant';
    const client: OAuthClient = {
      id: secret(),
      name,
      redirectUris: uris as string[],
      created: Date.now(),
    };
    const clients = [...this.file.clients];
    while (clients.length >= MAX_CLIENTS) clients.splice(evictionIndex(clients), 1);
    this.save({ ...this.file, clients: [...clients, client] });
    return client;
  }

  client(id: string): OAuthClient | undefined {
    this.refresh();
    return this.file.clients.find((c) => c.id === id);
  }

  /** Checks a request from the authorization page before the game master is asked. */
  check(params: URLSearchParams): AuthorizationRequest & { clientName: string } {
    const client = this.client(params.get('client_id') ?? '');
    const redirectUri = params.get('redirect_uri') ?? '';
    // Without a known client and its own redirect URI there is nowhere safe to send an error.
    if (!client) throw new OAuthError('invalid_client', 'Unknown app');
    if (!client.redirectUris.includes(redirectUri)) {
      throw new OAuthError('invalid_client', 'Unknown redirect URI');
    }
    if (params.get('response_type') !== 'code') {
      throw new OAuthError('unsupported_response_type', 'Only "code" is supported');
    }
    const codeChallenge = params.get('code_challenge') ?? '';
    if (params.get('code_challenge_method') !== 'S256' || !/^[\w-]{43,128}$/.test(codeChallenge)) {
      throw new OAuthError('invalid_request', 'PKCE with S256 is required');
    }
    return {
      clientId: client.id,
      clientName: client.name,
      redirectUri,
      codeChallenge,
      state: params.get('state') ?? undefined,
    };
  }

  /** The game master allowed the app: the address to send the browser back to. */
  approve(request: AuthorizationRequest): string {
    const code = secret();
    this.prune();
    this.codes.set(digest(code), { ...request, expires: Date.now() + CODE_MS });
    return redirectWith(request, { code });
  }

  deny(request: AuthorizationRequest): string {
    return redirectWith(request, { error: 'access_denied' });
  }

  /** The token endpoint, for both grant types. */
  token(form: URLSearchParams): Tokens {
    this.refresh();
    const grantType = form.get('grant_type');
    if (grantType === 'authorization_code') {
      const key = digest(form.get('code') ?? '');
      const pending = this.codes.get(key);
      if (pending?.used) {
        // A code used twice may have been stolen: the tokens it gave are revoked (RFC 6749 4.1.2).
        this.save({ ...this.file, grants: this.file.grants.filter((g) => g.code !== key) });
        throw new OAuthError('invalid_grant', 'The code is wrong, used or expired');
      }
      if (pending) {
        this.codes.set(key, { ...pending, used: true, expires: Date.now() + USED_CODE_MS });
      }
      const verifier = form.get('code_verifier') ?? '';
      if (!isCodeVerifier(verifier)) {
        throw new OAuthError('invalid_request', 'The code verifier needs 43 to 128 characters');
      }
      if (
        !pending ||
        pending.expires < Date.now() ||
        pending.clientId !== form.get('client_id') ||
        pending.redirectUri !== form.get('redirect_uri') ||
        !safeEqual(challengeOf(verifier), pending.codeChallenge)
      ) {
        throw new OAuthError('invalid_grant', 'The code is wrong, used or expired');
      }
      return this.issue(pending.clientId, key);
    }
    if (grantType === 'refresh_token') {
      const refresh = digest(form.get('refresh_token') ?? '');
      const grant = this.file.grants.find(
        (g) => safeEqual(g.refresh, refresh) && g.refreshExpires > Date.now(),
      );
      if (!grant || grant.clientId !== form.get('client_id')) {
        throw new OAuthError('invalid_grant', 'The refresh token is wrong or expired');
      }
      // Each refresh token works once; the new one replaces it.
      this.save({ ...this.file, grants: this.file.grants.filter((g) => g !== grant) });
      return this.issue(grant.clientId, grant.code);
    }
    throw new OAuthError('unsupported_grant_type', 'Use authorization_code or refresh_token');
  }

  /** Whether a bearer token opens the MCP endpoint. */
  checkAccessToken(token: string): boolean {
    this.refresh();
    const access = digest(token);
    return this.file.grants.some(
      (g) => safeEqual(g.access, access) && g.accessExpires > Date.now(),
    );
  }

  /** How many AI assistants are connected now. */
  get connected(): number {
    this.refresh();
    const now = Date.now();
    return new Set(this.file.grants.filter((g) => g.refreshExpires > now).map((g) => g.clientId))
      .size;
  }

  /** Disconnects every AI assistant, e.g. when the password changes. */
  revokeAll(): void {
    this.codes.clear();
    this.save({ ...this.file, grants: [] });
  }

  /** Removes everything, for a reset of the password on the server. */
  static reset(dataDir: string): void {
    rmSync(join(dataDir, AUTH_DIR, OAUTH_FILE), { force: true });
  }

  private issue(clientId: string, code: string | undefined): Tokens {
    const access = secret();
    const refresh = secret();
    const now = Date.now();
    const grant: Grant = {
      clientId,
      access: digest(access),
      accessExpires: now + ACCESS_MS,
      refresh: digest(refresh),
      refreshExpires: now + REFRESH_MS,
      ...(code ? { code } : {}),
    };
    const grants = [...this.file.grants.filter((g) => g.refreshExpires > now), grant].slice(
      -MAX_GRANTS,
    );
    const clients = this.file.clients.map((c) => (c.id === clientId ? { ...c, used: now } : c));
    this.save({ clients, grants });
    return {
      access_token: access,
      token_type: 'Bearer',
      expires_in: ACCESS_MS / 1000,
      refresh_token: refresh,
    };
  }

  private prune(): void {
    const now = Date.now();
    for (const [key, code] of this.codes) if (code.expires < now) this.codes.delete(key);
  }

  /** Reads the file again if it changed, e.g. because it was reset on the server. */
  private refresh(): void {
    let time: number;
    try {
      time = statSync(this.path).mtimeMs;
    } catch {
      time = 0;
    }
    if (time === this.fileTime) return;
    this.fileTime = time;
    this.file = time === 0 ? { clients: [], grants: [] } : readOAuthFile(this.path);
    if (time === 0) this.codes.clear();
  }

  private save(file: OAuthFile): void {
    const temp = `${this.path}.${process.pid}.tmp`;
    writeFileSync(temp, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
    renameSync(temp, this.path);
    this.file = file;
    this.fileTime = statSync(this.path).mtimeMs;
  }
}

/** The registration to drop for a new one: the oldest never used, else the longest unused. */
function evictionIndex(clients: OAuthClient[]): number {
  const unused = clients.findIndex((c) => c.used === undefined);
  if (unused >= 0) return unused;
  let index = 0;
  clients.forEach((c, i) => {
    if ((c.used ?? 0) < (clients[index]?.used ?? 0)) index = i;
  });
  return index;
}

/** 43 to 128 unreserved characters (RFC 7636 4.1). */
function isCodeVerifier(value: string): boolean {
  return /^[A-Za-z0-9._~-]{43,128}$/.test(value);
}

/** https only, except for apps on the same computer (RFC 8252). */
function isRedirectUri(value: unknown): boolean {
  if (typeof value !== 'string' || value.length > 2000) return false;
  try {
    const url = new URL(value);
    if (url.hash) return false;
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

function redirectWith(request: AuthorizationRequest, params: Record<string, string>): string {
  const url = new URL(request.redirectUri);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  if (request.state !== undefined) url.searchParams.set('state', request.state);
  return url.toString();
}

function challengeOf(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

function readOAuthFile(path: string): OAuthFile {
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<OAuthFile>;
    return {
      clients: Array.isArray(raw.clients) ? raw.clients : [],
      grants: Array.isArray(raw.grants) ? raw.grants : [],
    };
  } catch {
    return { clients: [], grants: [] };
  }
}

function secret(): string {
  return randomBytes(24).toString('base64url');
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
