import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Auth } from '../src/auth';
import { Attempts, clientAddress } from '../src/limits';
import { LorewardenServer } from '../src/server';
import { Store } from '../src/store';

const PASSWORD = 'correct horse battery';

interface Answer {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

describe('Auth', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lorewarden-auth-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('offers a setup link until there is a password', async () => {
    const lines: string[] = [];
    const auth = await Auth.open(dir, { log: (line) => lines.push(line) });
    const token = auth.setupToken ?? '';
    expect(token).toHaveLength(32);
    expect(lines[0]).toContain(`/setup?token=${token}`);
    expect(auth.checkSetupToken(token)).toBe(true);
    expect(auth.checkSetupToken('nope')).toBe(false);

    await auth.setPassword(PASSWORD);
    expect(auth.source).toBe('settings');
    expect(auth.setupToken).toBeUndefined();
    expect(auth.checkSetupToken(token)).toBe(false);
    expect(await auth.verify(PASSWORD)).toBe(true);
    expect(await auth.verify('wrong password!')).toBe(false);
    // Nothing secret is kept in plain text.
    const file = readFileSync(join(dir, '.lorewarden', 'auth.json'), 'utf8');
    expect(file).not.toContain(PASSWORD);
  });

  it('keeps sessions across restarts and ends them with a new password', async () => {
    const auth = await Auth.open(dir);
    await auth.setPassword(PASSWORD);
    const session = auth.createSession();
    expect(auth.hasSession(session)).toBe(true);
    expect((await Auth.open(dir)).hasSession(session)).toBe(true);
    expect(auth.hasSession('made-up')).toBe(false);

    await auth.setPassword(`${PASSWORD} 2`);
    expect(auth.hasSession(session)).toBe(false);

    const other = auth.createSession();
    auth.endSession(other);
    expect(auth.hasSession(other)).toBe(false);
  });

  it('notices a reset on the server while it runs', async () => {
    const lines: string[] = [];
    const running = await Auth.open(dir, { log: (line) => lines.push(line) });
    await running.setPassword(PASSWORD);
    const session = running.createSession();

    const token = (await Auth.open(dir)).resetPassword();
    // A file written within the same millisecond would look unchanged.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(running.hasPassword).toBe(false);
    expect(running.hasSession(session)).toBe(false);
    expect(running.setupToken).toBe(token);
    expect(lines.at(-1)).toContain(token);
  });

  it('prefers a password from the environment', async () => {
    const auth = await Auth.open(dir, { password: PASSWORD });
    expect(auth.source).toBe('environment');
    expect(auth.setupToken).toBeUndefined();
    expect(await auth.verify(PASSWORD)).toBe(true);
  });

  it('lets nobody in with a broken file', async () => {
    const first = await Auth.open(dir);
    await first.setPassword(PASSWORD);
    writeFileSync(join(dir, '.lorewarden', 'auth.json'), '{ broken');
    const auth = await Auth.open(dir);
    expect(auth.hasPassword).toBe(true);
    expect(await auth.verify(PASSWORD)).toBe(false);
    expect(await auth.verify('')).toBe(false);
  });

  it('keeps the token for programs', async () => {
    const auth = await Auth.open(dir);
    expect((await Auth.open(dir)).token).toBe(auth.token);
    expect(auth.checkToken(auth.token)).toBe(true);
    expect(auth.checkToken('x')).toBe(false);
  });
});

describe('Attempts', () => {
  it('blocks after too many failures within the window', () => {
    const attempts = new Attempts(2, 60_000);
    attempts.fail('a', 0);
    expect(attempts.retryAfter('a', 1000)).toBe(0);
    attempts.fail('a', 1000);
    expect(attempts.retryAfter('a', 1000)).toBe(59);
    expect(attempts.retryAfter('b', 1000)).toBe(0);
    expect(attempts.retryAfter('a', 60_001)).toBe(0);
  });

  it('counts an attempt up front and takes it back when it turns out right', () => {
    const attempts = new Attempts(2, 60_000);
    const first = attempts.reserve('a', 0);
    attempts.reserve('a', 0);
    expect(attempts.retryAfter('a', 0)).toBe(60);
    first();
    expect(attempts.retryAfter('a', 0)).toBe(0);
    first();
    attempts.fail('a', 1);
    expect(attempts.retryAfter('a', 1)).toBe(60);
  });

  it('counts the address a trusted proxy passes on', () => {
    const req = {
      headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
      socket: { remoteAddress: '127.0.0.1' },
    } as never;
    expect(clientAddress(req, false)).toBe('127.0.0.1');
    expect(clientAddress(req, true)).toBe('5.6.7.8');
  });
});

describe('Lorewarden server with sign-in', () => {
  let server: LorewardenServer;
  let auth: Auth;
  let port: number;
  let dirs: string[];

  /** A request through a reverse proxy, which passes on its own host name. */
  function call(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      cookie?: string;
      host?: string;
      token?: string;
      headers?: Record<string, string>;
    } = {},
  ): Promise<Answer> {
    const body = options.body === undefined ? undefined : JSON.stringify(options.body);
    const headers: Record<string, string> = {
      Host: options.host ?? 'lore.example.org',
      ...options.headers,
    };
    if (body) headers['Content-Type'] = 'application/json';
    if (options.cookie) headers.Cookie = options.cookie;
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    return new Promise((resolve, reject) => {
      const req = request(
        { port, host: '127.0.0.1', path, method: options.method ?? 'GET', headers },
        (res) => {
          let text = '';
          res.on('data', (chunk) => {
            text += chunk;
          });
          res.on('end', () =>
            resolve({ status: res.statusCode ?? 0, headers: res.headers, body: text }),
          );
        },
      );
      req.on('error', reject);
      req.end(body);
    });
  }

  const cookieOf = (answer: Answer) =>
    String(answer.headers['set-cookie']?.[0] ?? '').split(';')[0] ?? '';

  async function start(password?: string) {
    const [data, app] = [
      mkdtempSync(join(tmpdir(), 'lorewarden-data-')),
      mkdtempSync(join(tmpdir(), 'lorewarden-app-')),
    ];
    dirs = [data, app];
    writeFileSync(join(app, 'index.html'), '<!doctype html><title>App</title>');
    writeFileSync(join(app, 'app.js'), 'console.log(1)');
    auth = await Auth.open(data, { password });
    server = new LorewardenServer({ store: new Store(data), auth, gmDir: app, playerDir: app });
    port = await server.listen(0, '127.0.0.1');
  }

  afterEach(async () => {
    await server.close();
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  it('lets the first password be chosen with the setup link only', async () => {
    await start();
    expect((await call('/api/adventures')).status).toBe(401);
    expect(JSON.parse((await call('/api/auth/status')).body)).toEqual({
      access: false,
      password: 'none',
      local: false,
    });
    // Other computers get the player app, but the setup page and its files are there.
    expect((await call('/')).headers.location).toBe('/play/');
    expect((await call('/setup')).body).toContain('<title>App</title>');
    expect((await call('/app.js')).status).toBe(200);
    expect((await call('/missing.js')).status).toBe(404);

    const setup = (body: unknown) => call('/api/auth/setup', { method: 'POST', body });
    expect((await setup({ password: PASSWORD, token: 'guess' })).status).toBe(403);
    const token = auth.setupToken;
    expect((await setup({ password: 'short', token })).status).toBe(400);
    const done = await setup({ password: PASSWORD, token });
    expect(done.status).toBe(204);
    expect(done.headers['set-cookie']?.[0]).toMatch(/HttpOnly; SameSite=Strict/);
    const cookie = cookieOf(done);

    expect((await call('/api/adventures', { cookie })).status).toBe(200);
    expect((await setup({ password: PASSWORD, token })).status).toBe(409);
    // With a password, this computer has to sign in too; programs use the token.
    expect((await call('/api/adventures', { host: 'localhost' })).status).toBe(401);
    expect((await call('/api/adventures', { host: 'localhost', token: auth.token })).status).toBe(
      200,
    );
    expect((await call('/')).body).toContain('<title>App</title>');
  });

  it('needs no setup link on the server itself', async () => {
    await start();
    expect((await call('/api/adventures', { host: 'localhost' })).status).toBe(200);
    // A reverse proxy that passes on a forged host name does not make a visitor local.
    const proxied = await call('/api/adventures', {
      host: 'localhost',
      headers: { 'X-Real-IP': '203.0.113.9' },
    });
    expect(proxied.status).toBe(401);
    const done = await call('/api/auth/setup', {
      method: 'POST',
      host: 'localhost',
      body: { password: PASSWORD },
    });
    expect(done.status).toBe(204);
    expect(auth.hasPassword).toBe(true);
  });

  it('signs in and out and stops guessing', async () => {
    await start(PASSWORD);
    const login = (password: string) =>
      call('/api/auth/login', { method: 'POST', body: { password } });
    const answer = await login(PASSWORD);
    expect(answer.status).toBe(204);
    const cookie = cookieOf(answer);
    expect(JSON.parse((await call('/api/auth/status', { cookie })).body)).toMatchObject({
      access: true,
      password: 'environment',
    });
    expect((await call('/api/auth/logout', { method: 'POST', cookie })).status).toBe(204);
    expect((await call('/api/adventures', { cookie })).status).toBe(401);

    for (let i = 0; i < 5; i++) expect((await login('wrong guess here')).status).toBe(403);
    const blocked = await login(PASSWORD);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('stops guesses sent at the same time', async () => {
    await start(PASSWORD);
    const guesses = await Promise.all(
      Array.from({ length: 30 }, () =>
        call('/api/auth/login', { method: 'POST', body: { password: 'wrong guess here' } }),
      ),
    );
    const statuses = guesses.map((answer) => answer.status);
    expect(statuses.filter((status) => status === 403)).toHaveLength(5);
    expect(statuses.filter((status) => status === 429)).toHaveLength(25);
  });

  it('does not count a right password as a failed attempt', async () => {
    await start(PASSWORD);
    const login = (password: string) =>
      call('/api/auth/login', { method: 'POST', body: { password } });
    for (let i = 0; i < 4; i++) expect((await login('wrong guess here')).status).toBe(403);
    for (let i = 0; i < 3; i++) expect((await login(PASSWORD)).status).toBe(204);
    expect((await login('wrong guess here')).status).toBe(403);
    expect((await login(PASSWORD)).status).toBe(429);
  });

  it('changes the password and signs out every other browser', async () => {
    await start();
    await auth.setPassword(PASSWORD);
    const sign = async () =>
      cookieOf(await call('/api/auth/login', { method: 'POST', body: { password: PASSWORD } }));
    const [mine, other] = [await sign(), await sign()];
    const change = (current: string) =>
      call('/api/auth/password', {
        method: 'POST',
        cookie: mine,
        body: { current, password: 'a brand new password' },
      });
    expect((await change('not the password')).status).toBe(403);
    const changed = await change(PASSWORD);
    expect(changed.status).toBe(204);
    expect((await call('/api/adventures', { cookie: other })).status).toBe(401);
    expect((await call('/api/adventures', { cookie: cookieOf(changed) })).status).toBe(200);
  });

  it('cannot change a password from the environment', async () => {
    await start(PASSWORD);
    const cookie = cookieOf(
      await call('/api/auth/login', { method: 'POST', body: { password: PASSWORD } }),
    );
    const answer = await call('/api/auth/password', {
      method: 'POST',
      cookie,
      body: { current: PASSWORD, password: 'a brand new password' },
    });
    expect(answer.status).toBe(403);
  });

  it('stops guessing join codes and sends security headers', async () => {
    await start();
    const state = { code: 'K7QM2X', title: 'Test', reveals: [] };
    await call('/api/gm/state', { method: 'PUT', host: 'localhost', body: state });
    const image = (code: string) => call(`/api/player/images/x?code=${code}&id=p`);
    for (let i = 0; i < 20; i++) expect((await image('AAAAAA')).status).toBe(404);
    expect((await image('K7QM2X')).status).toBe(429);

    const page = await call('/play/');
    expect(page.headers['content-security-policy']).toContain("frame-ancestors 'none'");
  });

  it('stops join code guesses sent at the same time', async () => {
    await start();
    const state = { code: 'K7QM2X', title: 'Test', reveals: [] };
    await call('/api/gm/state', { method: 'PUT', host: 'localhost', body: state });
    const guess = (path: string, body: unknown) => call(path, { method: 'POST', body });
    const statuses = (
      await Promise.all([
        ...Array.from({ length: 15 }, () =>
          guess('/api/player/initiative', { code: 'AAAAAA', id: 'p', value: 10 }),
        ),
        ...Array.from({ length: 15 }, () =>
          guess('/api/player/signup', { code: 'AAAAAA', id: 'p', character: { name: 'Wren' } }),
        ),
      ])
    ).map((answer) => answer.status);
    expect(statuses.filter((status) => status === 403)).toHaveLength(20);
    expect(statuses.filter((status) => status === 429)).toHaveLength(10);
  });

  it('keeps sending security headers', async () => {
    await start();
    const page = await call('/play/');
    expect(page.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(page.headers['x-content-type-options']).toBe('nosniff');
  });
});
