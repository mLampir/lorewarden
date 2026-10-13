import { readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Adventure, startSession } from '@lorewarden/core';
import { ServerAdventures } from '@lorewarden/mcp/src/api';
import { createServer } from '@lorewarden/mcp/src/server';
import { AdventureStore } from '@lorewarden/mcp/src/store';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LorewardenServer } from '../src/server';
import { Store } from '../src/store';

let dir: string;
let lorewarden: LorewardenServer;
let base: string;
let client: Client;
const original = globalThis.fetch;

async function connect(adventures: ServerAdventures) {
  const server = createServer(adventures, {
    tableState: () => adventures.tableState(),
    appSettings: () => adventures.appSettings(),
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(clientSide);
}

async function callJson(name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  const body = (result.content as { text: string }[])[0]?.text ?? '';
  if (result.isError) throw new Error(body);
  return JSON.parse(body);
}

/** Collects the server's notices to the game master app. */
async function listen(): Promise<{ events: string[]; close: () => void }> {
  const controller = new AbortController();
  const response = await fetch(`${base}/api/gm/events`, { signal: controller.signal });
  const reader = response.body?.pipeThrough(new TextDecoderStream()).getReader();
  const events: string[] = [];
  void (async () => {
    try {
      for (;;) {
        const { value, done } = (await reader?.read()) ?? { done: true };
        if (done) return;
        events.push(value ?? '');
      }
    } catch {
      // Closed by the test.
    }
  })();
  return { events, close: () => controller.abort() };
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lorewarden-mcp-api-'));
  lorewarden = new LorewardenServer({ store: new Store(dir), playerDir: dir, gmDir: dir });
  base = `http://127.0.0.1:${await lorewarden.listen(0, '127.0.0.1')}`;
});

afterEach(async () => {
  await client.close();
  await lorewarden.close();
  await rm(dir, { recursive: true, force: true });
});

describe('MCP server with the Lorewarden server', () => {
  it('saves through the server, so the open app hears of every change', async () => {
    await connect(new ServerAdventures(base));
    const app = await listen();
    const { id } = await callJson('create_adventure', {
      title: 'The Silent Mill',
      partySize: 4,
      partyLevel: 3,
    });
    await callJson('upsert_scene', { adventureId: id, title: 'Mill yard' });

    const saved = (await (await fetch(`${base}/api/adventures/${id}`)).json()) as Adventure;
    expect(saved.scenes.map((scene) => scene.title)).toEqual(['Mill yard']);
    await expect.poll(() => app.events.join('')).toContain('"client":"mcp"');
    app.close();

    const listed = await callJson('list_adventures');
    expect(listed.location).toContain(base);
  });

  it('lists the adventures without reading each one', async () => {
    const adventures = new ServerAdventures(base);
    await connect(adventures);
    const { id } = await callJson('create_adventure', {
      title: 'The Silent Mill',
      partySize: 4,
      partyLevel: 3,
    });
    const fetched: string[] = [];
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      fetched.push(String(input));
      return original(input, init);
    });
    try {
      const listed = await callJson('list_adventures');
      expect(listed.adventures).toEqual([
        { id, title: 'The Silent Mill', party: { size: 4, level: 3 }, scenes: 0 },
      ]);
    } finally {
      spy.mockRestore();
    }
    expect(fetched).toEqual([`${base}/api/adventures`]);
  });

  it('applies a change again when the game master saved in between', async () => {
    const adventures = new ServerAdventures(base);
    await connect(adventures);
    const { id } = await callJson('create_adventure', {
      title: 'The Silent Mill',
      partySize: 4,
      partyLevel: 3,
    });
    const file = join(dir, 'the-silent-mill.adventure.json');
    let calls = 0;
    const saved = await adventures.update(id, (adventure) => {
      calls++;
      // The game master renames it in the app after the assistant read it.
      if (calls === 1) {
        const text = readFileSync(file, 'utf8');
        writeFileSync(file, text.replace('"title": "The Silent Mill"', '"title": "The Loud Mill"'));
      }
      return { ...adventure, summary: 'Fog lies over the mill.' };
    });
    expect(calls).toBe(2);
    expect(saved).toMatchObject({ title: 'The Loud Mill', summary: 'Fog lies over the mill.' });
    const stored = (await (await fetch(`${base}/api/adventures/${id}`)).json()) as Adventure;
    expect(stored).toMatchObject({ title: 'The Loud Mill', summary: 'Fog lies over the mill.' });

    // An adventure that keeps changing is not saved, and the assistant is told to try again.
    let attempt = 0;
    const busy = adventures.update(id, (adventure) => {
      attempt++;
      const text = readFileSync(file, 'utf8');
      writeFileSync(file, text.replace(/"summary": "[^"]*"/, `"summary": "Edit ${attempt}"`));
      return { ...adventure, title: 'Never saved' };
    });
    await expect(busy).rejects.toThrow(/kept changing/);
    const after = (await (await fetch(`${base}/api/adventures/${id}`)).json()) as Adventure;
    expect(after.title).toBe('The Loud Mill');
  });

  it('writes new adventures in the languages chosen in the app', async () => {
    await connect(new ServerAdventures(base));
    await fetch(`${base}/api/settings`, {
      method: 'PUT',
      body: JSON.stringify({ language: 'de', termsLanguage: 'en' }),
    });
    const { id } = await callJson('create_adventure', {
      title: 'Die stille Mühle',
      partySize: 4,
      partyLevel: 3,
    });
    const adventure = await callJson('get_adventure', { adventureId: id });
    expect(adventure).toMatchObject({ language: 'de', termsLanguage: 'en' });
  });

  it('shows the scene of the session the app saved last', async () => {
    await connect(new ServerAdventures(base));
    const { id } = await callJson('create_adventure', {
      title: 'The Silent Mill',
      partySize: 4,
      partyLevel: 3,
    });
    await callJson('upsert_scene', { adventureId: id, title: 'Mill yard' });
    const adventure = (await (await fetch(`${base}/api/adventures/${id}`)).json()) as Adventure;
    const session = startSession(adventure);
    await fetch(`${base}/api/sessions/${session.id}`, {
      method: 'PUT',
      body: JSON.stringify(session),
    });

    const table = await callJson('get_table_state');
    expect(table.adventure.title).toBe('The Silent Mill');
    expect(table.currentScene.title).toBe('Mill yard');
  });

  it('works on the folder while the server is not running', async () => {
    await lorewarden.close();
    await connect(new ServerAdventures(base, new AdventureStore(dir)));
    const { id } = await callJson('create_adventure', {
      title: 'The Silent Mill',
      partySize: 4,
      partyLevel: 3,
    });
    const listed = await callJson('list_adventures');
    expect(listed.location).toContain('not running');
    expect(await readdir(dir)).toContain('the-silent-mill.adventure.json');

    // Once it runs again, the adventure is there.
    lorewarden = new LorewardenServer({ store: new Store(dir), playerDir: dir, gmDir: dir });
    base = `http://127.0.0.1:${await lorewarden.listen(0, '127.0.0.1')}`;
    expect((await fetch(`${base}/api/adventures/${id}`)).status).toBe(200);
  });

  it('says so when a server without a folder cannot be reached', async () => {
    await lorewarden.close();
    await connect(new ServerAdventures(base));
    const result = await client.callTool({ name: 'list_adventures', arguments: {} });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('cannot be reached');
  });
});
