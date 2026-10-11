import { mkdtemp, rm } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Adventure, startSession } from '@lorewarden/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppBridge } from '../src/bridge';
import { emptyAdventure, upsertScene } from '../src/edits';
import { describeTable } from '../src/server';
import { AdventureStore } from '../src/store';

let dir: string;
let bridge: AppBridge;
let port: number;
const APP = 'http://localhost:5173';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lorewarden-bridge-'));
  bridge = new AppBridge(new AdventureStore(dir));
  port = await bridge.listen(0);
});

afterEach(async () => {
  await bridge.close();
  await rm(dir, { recursive: true, force: true });
});

function send(method: string, path: string, body?: unknown, origin = APP) {
  return fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Opens the event stream like the app does and collects the events it receives. */
function connect(): Promise<{ events: { event: string; data: unknown }[]; close: () => void }> {
  return new Promise((resolve, reject) => {
    const events: { event: string; data: unknown }[] = [];
    const req = request(
      { host: '127.0.0.1', port, path: '/events', headers: { Origin: APP } },
      (res) => {
        let buffer = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          buffer += chunk;
          let end = buffer.indexOf('\n\n');
          while (end >= 0) {
            const block = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            const event = /^event: (.*)$/m.exec(block)?.[1];
            const data = /^data: (.*)$/m.exec(block)?.[1];
            if (event) events.push({ event, data: JSON.parse(data ?? 'null') });
            if (event === 'hello') resolve({ events, close: () => req.destroy() });
            end = buffer.indexOf('\n\n');
          }
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

function sample(): Adventure {
  const adventure = emptyAdventure({ title: 'Mill', partySize: 4, partyLevel: 2 });
  return upsertScene(adventure, { title: 'Yard', description: 'Flour everywhere.' }).adventure;
}

async function waitFor(check: () => boolean) {
  for (let i = 0; i < 50 && !check(); i++) await new Promise((r) => setTimeout(r, 10));
}

describe('AppBridge', () => {
  it('uses the folder while the app is not connected', async () => {
    expect(bridge.connected).toBe(false);
    expect(bridge.location).toContain(dir);
    await bridge.add(sample());
    expect((await new AdventureStore(dir).list()).adventures).toHaveLength(1);
  });

  it('works on the adventures of the connected app and sends changes back', async () => {
    const app = await connect();
    const adventure = sample();
    expect((await send('POST', '/sync', { adventures: [adventure], sessions: [] })).status).toBe(
      204,
    );

    expect(bridge.location).toBe('the open Lorewarden app');
    const { adventures } = await bridge.list();
    expect(adventures.map((a) => a.adventure.id)).toEqual([adventure.id]);

    await bridge.update(adventure.id, (a) => ({ ...a, title: 'Silent Mill' }));
    await waitFor(() => app.events.some((e) => e.event === 'adventure'));
    const sent = app.events.find((e) => e.event === 'adventure')?.data as { adventure: Adventure };
    expect(sent.adventure.title).toBe('Silent Mill');

    // Changes the game master makes in the app replace the copy here.
    await send('PUT', `/adventures/${adventure.id}`, {
      adventure: { ...adventure, title: 'Mine' },
    });
    expect((await bridge.get(adventure.id)).adventure.title).toBe('Mine');

    app.close();
    await waitFor(() => !bridge.connected);
    expect(bridge.connected).toBe(false);
  });

  it('knows the languages the app uses for new adventures', async () => {
    const app = await connect();
    await send('POST', '/sync', { adventures: [], settings: { language: 'de' } });
    expect(bridge.appSettings()).toEqual({ language: 'de' });
    await send('PUT', '/settings', { settings: { language: 'de', termsLanguage: 'en' } });
    expect(bridge.appSettings()).toEqual({ language: 'de', termsLanguage: 'en' });
    app.close();
  });

  it('knows the scene the party is in', async () => {
    const app = await connect();
    const adventure = sample();
    const session = startSession(adventure);
    await send('POST', '/sync', { adventures: [adventure], sessions: [session] });

    const state = bridge.tableState();
    expect(state).toBeDefined();
    if (!state) return;
    const table = describeTable(state);
    expect(table.currentScene?.title).toBe('Yard');
    app.close();
  });

  it('turns away web pages from other origins and host names', async () => {
    expect((await send('POST', '/sync', { adventures: [] }, 'https://example.com')).status).toBe(
      403,
    );
    const status = await new Promise<number>((resolve) => {
      request(
        { host: '127.0.0.1', port, path: '/events', headers: { Host: 'evil.example' } },
        (res) => resolve(res.statusCode ?? 0),
      ).end();
    });
    expect(status).toBe(403);
  });
});
