import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Kept in the data folder, next to the adventures, readable by the server's user only. */
export const AUTH_DIR = '.lorewarden';
const AUTH_FILE = 'auth.json';
/** Lets programs on the server, such as the MCP server, use the API without a password. */
export const TOKEN_FILE = 'token';

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 256;
export const SESSION_DAYS = 30;
const MAX_SESSIONS = 20;

// About 100 ms per check on a small server, which makes guessing slow even for a stolen file.
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keylen: 64 };

interface PasswordHash {
  salt: string;
  hash: string;
  N: number;
  r: number;
  p: number;
}

interface StoredSession {
  /** SHA-256 of the cookie value; the value itself is never kept. */
  id: string;
  expires: number;
}

interface AuthFile {
  password?: PasswordHash;
  /** Lets the first password be chosen from another computer, see setupToken. */
  setupToken?: string;
  sessions: StoredSession[];
}

export type PasswordSource = 'none' | 'settings' | 'environment';

/**
 * The game master's password, sign-in sessions and the token for programs on the server.
 *
 * Without a password, Lorewarden works as before on the computer it runs on. To use it from
 * elsewhere, someone chooses a password: on this computer, or with the setup link the server
 * prints, which only someone who can read the server's log has. A password from the environment
 * takes the place of the stored one and cannot be changed in the app.
 */
export class Auth {
  private file: AuthFile = { sessions: [] };
  private fileTime = -1;
  private environmentHash: PasswordHash | undefined;
  readonly token: string;
  private readonly dir: string;

  private constructor(
    dataDir: string,
    private readonly log: (message: string) => void,
  ) {
    this.dir = join(dataDir, AUTH_DIR);
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    this.token = readOrCreate(join(this.dir, TOKEN_FILE));
    this.refresh();
  }

  static async open(
    dataDir: string,
    options: { password?: string; log?: (message: string) => void } = {},
  ): Promise<Auth> {
    const auth = new Auth(dataDir, options.log ?? (() => undefined));
    if (options.password) auth.environmentHash = await hashPassword(options.password);
    auth.offerSetup();
    return auth;
  }

  get source(): PasswordSource {
    this.refresh();
    if (this.environmentHash) return 'environment';
    return this.file.password ? 'settings' : 'none';
  }

  get hasPassword(): boolean {
    return this.source !== 'none';
  }

  /** The secret in the setup link, while there is no password yet. */
  get setupToken(): string | undefined {
    return this.hasPassword ? undefined : this.file.setupToken;
  }

  checkSetupToken(token: string): boolean {
    const expected = this.setupToken;
    return expected !== undefined && safeEqual(token, expected);
  }

  async verify(password: string): Promise<boolean> {
    this.refresh();
    const stored = this.environmentHash ?? this.file.password;
    if (!stored || password.length > MAX_PASSWORD_LENGTH) return false;
    const hash = await derive(password, Buffer.from(stored.salt, 'base64'), stored);
    const expected = Buffer.from(stored.hash, 'base64');
    return hash.length === expected.length && timingSafeEqual(hash, expected);
  }

  /** Stores a new password and signs out every session. */
  async setPassword(password: string): Promise<void> {
    const hash = await hashPassword(password);
    this.refresh();
    this.write({ password: hash, sessions: [] });
  }

  /** Removes the password and every session; the next setup link is printed. */
  resetPassword(): string {
    this.refresh();
    const setupToken = newSecret();
    this.write({ setupToken, sessions: [] });
    return setupToken;
  }

  /** Starts a session and returns the value for its cookie. */
  createSession(): string {
    this.refresh();
    const value = newSecret();
    const now = Date.now();
    const sessions = this.file.sessions
      .filter((s) => s.expires > now)
      .slice(-(MAX_SESSIONS - 1))
      .concat({ id: digest(value), expires: now + SESSION_DAYS * 86_400_000 });
    this.write({ ...this.file, sessions });
    return value;
  }

  hasSession(value: string | undefined): boolean {
    if (!value) return false;
    this.refresh();
    const id = digest(value);
    return this.file.sessions.some((s) => s.expires > Date.now() && safeEqual(s.id, id));
  }

  endSession(value: string | undefined): void {
    if (!value) return;
    this.refresh();
    const id = digest(value);
    this.write({ ...this.file, sessions: this.file.sessions.filter((s) => s.id !== id) });
  }

  checkToken(value: string): boolean {
    return safeEqual(value, this.token);
  }

  /** Makes sure there is a setup link while there is no password, and prints it. */
  private offerSetup(): void {
    if (this.hasPassword) return;
    if (!this.file.setupToken) this.write({ ...this.file, setupToken: newSecret() });
    this.log(setupMessage(this.file.setupToken ?? ''));
  }

  /** Reads the file again if it changed, e.g. because the password was reset on the server. */
  private refresh(): void {
    const path = join(this.dir, AUTH_FILE);
    let time: number;
    try {
      time = statSync(path).mtimeMs;
    } catch {
      time = 0;
    }
    if (time === this.fileTime) return;
    const hadPassword = this.file.password !== undefined;
    this.fileTime = time;
    this.file = time === 0 ? { sessions: [] } : readAuthFile(path);
    if (hadPassword && !this.file.password && !this.environmentHash) this.offerSetup();
  }

  private write(file: AuthFile): void {
    const path = join(this.dir, AUTH_FILE);
    const temp = `${path}.${process.pid}.tmp`;
    writeFileSync(temp, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
    renameSync(temp, path);
    this.file = file;
    this.fileTime = statSync(path).mtimeMs;
  }
}

export function setupMessage(token: string): string {
  return (
    'Lorewarden has no password yet. To use it from another computer, open ' +
    `/setup?token=${token} at its address and choose one, or set LOREWARDEN_PASSWORD.`
  );
}

export function passwordProblem(password: unknown): 'short' | 'long' | undefined {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) return 'short';
  if (password.length > MAX_PASSWORD_LENGTH) return 'long';
  return undefined;
}

async function hashPassword(password: string): Promise<PasswordHash> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, SCRYPT);
  return { salt: salt.toString('base64'), hash: hash.toString('base64'), ...pick(SCRYPT) };
}

function pick({ N, r, p }: { N: number; r: number; p: number }) {
  return { N, r, p };
}

function derive(
  password: string,
  salt: Buffer,
  { N, r, p }: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize('NFC'),
      salt,
      SCRYPT.keylen,
      { N, r, p, maxmem: 256 * N * r },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

function readAuthFile(path: string): AuthFile {
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<AuthFile>;
    return { ...raw, sessions: Array.isArray(raw.sessions) ? raw.sessions : [] };
  } catch {
    // A broken file must not open the door: without a readable password nobody signs in
    // from elsewhere, and resetting the password writes a new file.
    return { password: { salt: '', hash: '', ...pick(SCRYPT) }, sessions: [] };
  }
}

function readOrCreate(path: string): string {
  try {
    const value = readFileSync(path, 'utf8').trim();
    if (value.length >= 32) return value;
  } catch {
    // Created below.
  }
  const value = newSecret();
  writeFileSync(path, `${value}\n`, { mode: 0o600 });
  return value;
}

function newSecret(): string {
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
