import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Auth } from '../src/auth';
import { mcpEndpoint } from '../src/mcp';
import { OAuth } from '../src/oauth';
import { LorewardenServer } from '../src/server';
import { Store } from '../src/store';

const PASSWORD = 'correct horse battery';
const CALLBACK = 'https://ai.example/callback';
const verifier = 'v'.repeat(50);
const challenge = createHash('sha256').update(verifier).digest('base64url');

describe('Connecting an AI assistant with OAuth', () => {
  let dir: string;
  let server: LorewardenServer;
  let base: string;
  let cookie: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'lorewarden-oauth-'));
    const auth = await Auth.open(dir, { password: PASSWORD });
    let port = 0;
    const endpoint = (req: IncomingMessage, res: ServerResponse) =>
      mcpEndpoint(`http://127.0.0.1:${port}`, auth.token, 'test')(req, res);
    server = new LorewardenServer({
      store: new Store(dir),
      auth,
      oauth: new OAuth(dir),
      mcp: endpoint,
      publicUrl: 'https://lore.example.org',
    });
    port = await server.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${port}`;
    const login = await post('/api/auth/login', { password: PASSWORD });
    cookie = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  });

  afterEach(async () => {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  function post(path: string, body: unknown, headers: Record<string, string> = {}) {
    return fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  }

  const token = (form: Record<string, string>) =>
    fetch(`${base}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form),
    });

  async function register(): Promise<string> {
    const answer = await post('/oauth/register', {
      client_name: 'Test AI',
      redirect_uris: [CALLBACK],
    });
    expect(answer.status).toBe(201);
    return ((await answer.json()) as { client_id: string }).client_id;
  }

  /** What the game master does on the authorization page. */
  async function authorize(clientId: string, allow = true): Promise<URL> {
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: CALLBACK,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: 'xyz',
    }).toString();
    const check = await post('/api/oauth/check', { query }, { Cookie: cookie });
    expect(await check.json()).toEqual({
      clientName: 'Test AI',
      redirectHost: 'ai.example',
      needsPassword: false,
    });
    const decision = await post('/api/oauth/decide', { query, allow }, { Cookie: cookie });
    return new URL(((await decision.json()) as { redirect: string }).redirect);
  }

  it('tells an AI assistant where to sign in', async () => {
    const answer = await fetch(`${base}/mcp`, { method: 'POST' });
    expect(answer.status).toBe(401);
    expect(answer.headers.get('www-authenticate')).toBe(
      'Bearer resource_metadata="https://lore.example.org/.well-known/oauth-protected-resource/mcp"',
    );
    const resource = await fetch(`${base}/.well-known/oauth-protected-resource/mcp`);
    expect(await resource.json()).toMatchObject({
      resource: 'https://lore.example.org/mcp',
      authorization_servers: ['https://lore.example.org'],
    });
    const metadata = await fetch(`${base}/.well-known/oauth-authorization-server`);
    expect(await metadata.json()).toMatchObject({
      issuer: 'https://lore.example.org',
      registration_endpoint: 'https://lore.example.org/oauth/register',
      code_challenge_methods_supported: ['S256'],
    });
  });

  it('connects after the game master allows it and works with the tools', async () => {
    const clientId = await register();
    const redirect = await authorize(clientId);
    expect(redirect.origin + redirect.pathname).toBe(CALLBACK);
    expect(redirect.searchParams.get('state')).toBe('xyz');
    const code = redirect.searchParams.get('code') ?? '';

    const exchange = {
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      redirect_uri: CALLBACK,
    };
    expect((await token({ ...exchange, code_verifier: 'w'.repeat(50) })).status).toBe(400);
    // A failed attempt uses the code up.
    expect((await token({ ...exchange, code_verifier: verifier })).status).toBe(400);

    const fresh = (await authorize(clientId)).searchParams.get('code') ?? '';
    const tokens = (await (
      await token({ ...exchange, code: fresh, code_verifier: verifier })
    ).json()) as { access_token: string; refresh_token: string };
    expect(tokens.access_token).toBeTruthy();
    expect((await token({ ...exchange, code: fresh, code_verifier: verifier })).status).toBe(400);

    const client = new Client({ name: 'test', version: '0.0.0' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
        requestInit: { headers: { Authorization: `Bearer ${tokens.access_token}` } },
      }),
    );
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain('create_adventure');
    const created = await client.callTool({
      name: 'create_adventure',
      arguments: { title: 'From the cloud', partySize: 4, partyLevel: 3 },
    });
    expect(created.isError).toBeFalsy();
    const list = (await (
      await fetch(`${base}/api/adventures`, { headers: { Cookie: cookie } })
    ).json()) as { adventures: { title: string }[] };
    expect(list.adventures.map((a) => a.title)).toEqual(['From the cloud']);
    await client.close();

    // Refresh tokens work once.
    const refresh = { grant_type: 'refresh_token', client_id: clientId };
    const renewed = await token({ ...refresh, refresh_token: tokens.refresh_token });
    expect(renewed.status).toBe(200);
    expect((await token({ ...refresh, refresh_token: tokens.refresh_token })).status).toBe(400);

    // Disconnecting in the settings closes the door.
    const { access_token } = (await renewed.json()) as { access_token: string };
    const connections = await fetch(`${base}/api/oauth/connections`, {
      headers: { Cookie: cookie },
    });
    expect(await connections.json()).toEqual({ connected: 1 });
    await fetch(`${base}/api/oauth/connections`, { method: 'DELETE', headers: { Cookie: cookie } });
    const closed = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access_token}` },
    });
    expect(closed.status).toBe(401);
  });

  it('sends a denial back and refuses unknown apps and addresses', async () => {
    const clientId = await register();
    const denied = await authorize(clientId, false);
    expect(denied.searchParams.get('error')).toBe('access_denied');
    expect(denied.searchParams.get('code')).toBeNull();

    const bad = await post('/oauth/register', { redirect_uris: ['http://evil.example/cb'] });
    expect(bad.status).toBe(400);
    const unknown = await post(
      '/api/oauth/check',
      { query: `response_type=code&client_id=nope&redirect_uri=${CALLBACK}` },
      { Cookie: cookie },
    );
    expect(unknown.status).toBe(400);
    // Only the signed-in game master may allow an app.
    const stranger = await post('/api/oauth/decide', { query: '', allow: true });
    expect(stranger.status).toBe(401);
  });
});
