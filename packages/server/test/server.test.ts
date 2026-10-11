import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type Adventure,
  createMonster,
  type PlayerView,
  parseAdventure,
  startSession,
  type TableState,
} from '@lorewarden/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LorewardenServer } from '../src/server';
import { Store } from '../src/store';

const pixel = 'data:image/png;base64,iVBORw0KGgo=';
const state: TableState = {
  code: 'K7QM2X',
  title: 'The Lantern in the Marsh',
  reveals: [
    {
      id: 'reveal-letter',
      at: '2026-01-01T18:00:00.000Z',
      title: 'Torn letter',
      image: { mimeType: 'image/png', src: pixel },
      to: 'all',
    },
    {
      id: 'reveal-secret',
      at: '2026-01-01T18:05:00.000Z',
      title: 'Secret',
      text: 'You recognise the seal.',
      to: ['player-wren'],
    },
  ],
};

interface Stream {
  next(event: string): Promise<unknown>;
  close(): void;
}

/** Reads server-sent events from a fetch response. */
function readEvents(response: Response, controller: AbortController): Stream {
  const reader = response.body?.pipeThrough(new TextDecoderStream()).getReader();
  if (!reader) throw new Error('No body');
  let buffer = '';
  const pending: { event: string; data: unknown }[] = [];
  return {
    async next(event) {
      for (;;) {
        const index = pending.findIndex((p) => p.event === event);
        if (index >= 0) return pending.splice(index, 1)[0]?.data;
        const { value, done } = await reader.read();
        if (done) throw new Error(`Stream ended before "${event}"`);
        buffer += value;
        let end = buffer.indexOf('\n\n');
        while (end >= 0) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const name = /^event: (.*)$/m.exec(block)?.[1];
          const data = /^data: (.*)$/m.exec(block)?.[1];
          if (name && data) pending.push({ event: name, data: JSON.parse(data) });
          end = buffer.indexOf('\n\n');
        }
      }
    },
    close: () => controller.abort(),
  };
}

function loadExample(): Adventure {
  const text = readFileSync(
    new URL('../../../examples/lantern-in-the-marsh.adventure.json', import.meta.url),
    'utf8',
  );
  const result = parseAdventure(text);
  if (!result.ok) throw new Error('Example does not parse');
  return result.adventure;
}

describe('Lorewarden server', () => {
  let server: LorewardenServer;
  let base: string;
  let playerDir: string;
  let dataDir: string;
  const streams: Stream[] = [];

  async function open(path: string, headers: Record<string, string> = {}): Promise<Stream> {
    const controller = new AbortController();
    const response = await fetch(base + path, { headers, signal: controller.signal });
    expect(response.status).toBe(200);
    const stream = readEvents(response, controller);
    streams.push(stream);
    return stream;
  }

  const joinAs = (id: string, name: string, code = state.code) =>
    open(`/api/player/events?code=${code}&id=${id}&name=${encodeURIComponent(name)}`);

  const putState = (body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${base}/api/gm/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

  /** fetch() always sends the real host, so a page pointing its own name here is simulated. */
  const statusWithHost = (path: string, host: string) =>
    new Promise<number>((resolve, reject) => {
      const req = request(base + path, { headers: { Host: host } }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on('error', reject);
      req.end();
    });

  beforeEach(async () => {
    playerDir = mkdtempSync(join(tmpdir(), 'lorewarden-player-'));
    writeFileSync(join(playerDir, 'index.html'), '<!doctype html><title>Player</title>');
    writeFileSync(join(playerDir, 'app.js'), 'console.log(1)');
    dataDir = mkdtempSync(join(tmpdir(), 'lorewarden-data-'));
    server = new LorewardenServer({ store: new Store(dataDir), playerDir, gmDir: playerDir });
    const port = await server.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    for (const stream of streams.splice(0)) stream.close();
    await server.close();
    rmSync(playerDir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('gives every player only what is meant for them', async () => {
    const gm = await open('/api/gm/events');
    expect(await gm.next('table')).toMatchObject({ players: [] });

    const wren = await joinAs('player-wren', 'Wren');
    expect(await wren.next('waiting')).toEqual({});
    expect(await gm.next('players')).toEqual({ players: [{ id: 'player-wren', name: 'Wren' }] });

    expect((await putState(state)).status).toBe(204);
    const wrenView = (await wren.next('view')) as PlayerView;
    expect(wrenView.reveals.map((r) => r.title)).toEqual(['Secret', 'Torn letter']);

    const ash = await joinAs('player-ash', 'Ash');
    const ashView = (await ash.next('view')) as PlayerView;
    expect(ashView.reveals.map((r) => r.title)).toEqual(['Torn letter']);

    const image = await fetch(base + (ashView.reveals[0]?.imageUrl ?? ''));
    expect(image.status).toBe(200);
    expect(image.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await image.arrayBuffer()).slice(0, 4)).toEqual(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    );
  });

  it('turns away phones with a wrong or outdated code', async () => {
    await putState(state);
    const stranger = await joinAs('player-x', 'X', 'AAAAAA');
    expect(await stranger.next('wrong-code')).toEqual({});

    const wren = await joinAs('player-wren', 'Wren');
    await wren.next('view');
    await putState({ ...state, code: 'NEWCQD' });
    expect(await wren.next('wrong-code')).toEqual({});
  });

  it('does not hand out images to the wrong player', async () => {
    await putState(state);
    const url = `${base}/api/player/images/reveal-secret?code=${state.code}&id=player-wren`;
    expect((await fetch(url)).status).toBe(404);
    const otherCode = `${base}/api/player/images/reveal-letter?code=AAAAAA&id=player-wren`;
    expect((await fetch(otherCode)).status).toBe(404);
  });

  it('accepts the game master only from this computer and allowed pages', async () => {
    expect((await putState({ code: 'nope' })).status).toBe(400);
    const evil = await putState(state, { Origin: 'https://evil.example' });
    expect(evil.status).toBe(403);
    expect(await statusWithHost('/api/adventures', 'evil.example')).toBe(401);
    expect(await statusWithHost('/api/adventures', 'localhost')).toBe(200);
    const local = await putState(state, { Origin: 'http://localhost:5173' });
    expect(local.status).toBe(204);
    expect(local.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
  });

  it('serves the apps and keeps out of other folders', async () => {
    const index = await fetch(`${base}/play/`);
    expect(await index.text()).toContain('<title>Player</title>');
    expect(index.headers.get('cache-control')).toBe('no-cache');
    expect(await (await fetch(`${base}/play/app.js`)).text()).toBe('console.log(1)');
    expect(await (await fetch(`${base}/adventures/x/play`)).text()).toContain('Player');
    const outside = await fetch(`${base}/play/%2e%2e/%2e%2e/etc/passwd`);
    expect(await outside.text()).not.toContain('root:');
  });

  it('keeps adventures and sessions and tells the app about changes', async () => {
    const gm = await open('/api/gm/events');
    await gm.next('table');
    const adventure = loadExample();
    const url = `${base}/api/adventures/${adventure.id}`;
    expect((await fetch(url)).status).toBe(404);

    const put = (body: unknown) =>
      fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Lorewarden-Client': 'tab-1' },
        body: JSON.stringify(body),
      });
    expect((await put(adventure)).status).toBe(204);
    expect(await gm.next('adventure')).toEqual({ id: adventure.id, client: 'tab-1' });
    expect((await put({ ...adventure, id: 'other' })).status).toBe(400);
    expect((await put({ ...adventure, title: '' })).status).toBe(400);

    expect(await (await fetch(url)).json()).toEqual(adventure);
    const list = (await (await fetch(`${base}/api/adventures`)).json()) as {
      adventures: { id: string; title: string; sceneCount: number }[];
    };
    expect(list.adventures).toEqual([
      expect.objectContaining({ id: adventure.id, title: adventure.title, sceneCount: 4 }),
    ]);

    const session = startSession(adventure);
    const sessionUrl = `${base}/api/sessions/${session.id}`;
    const saved = await fetch(sessionUrl, { method: 'PUT', body: JSON.stringify(session) });
    expect(saved.status).toBe(204);
    expect(await (await fetch(`${url}/session`)).json()).toEqual(session);

    expect((await fetch(url, { method: 'DELETE' })).status).toBe(204);
    expect(await gm.next('adventure-deleted')).toMatchObject({ id: adventure.id });
    expect((await fetch(`${url}/session`)).status).toBe(404);
    expect((await fetch(url, { method: 'DELETE' })).status).toBe(404);
  });

  it('keeps the monster library and tells the app about changes', async () => {
    const gm = await open('/api/gm/events');
    await gm.next('table');
    const monster = createMonster('Bog Imp');
    const url = `${base}/api/monsters/${monster.id}`;
    const put = (body: unknown) =>
      fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Lorewarden-Client': 'tab-1' },
        body: JSON.stringify(body),
      });
    expect(await (await fetch(`${base}/api/monsters`)).json()).toEqual({
      monsters: [],
      problems: [],
    });
    expect((await put(monster)).status).toBe(204);
    expect(await gm.next('monsters')).toEqual({ client: 'tab-1' });
    expect((await put({ ...monster, id: 'monster-other' })).status).toBe(400);
    expect((await put({ ...monster, cr: 0.3 })).status).toBe(400);
    const list = (await (await fetch(`${base}/api/monsters`)).json()) as { monsters: unknown[] };
    expect(list.monsters).toEqual([monster]);
    expect(readFileSync(join(dataDir, 'monsters.json'), 'utf8')).toContain('Bog Imp');

    expect((await fetch(url, { method: 'DELETE' })).status).toBe(204);
    expect(await gm.next('monsters')).toEqual({});
    expect((await fetch(url, { method: 'DELETE' })).status).toBe(404);
  });

  it('tells the game master app about a new release', async () => {
    const gm = await open('/api/gm/events');
    expect(await gm.next('table')).toMatchObject({ update: { current: 'dev' } });
    const update = { current: '1.0.0', latest: '1.1.0', url: 'https://example.org/1.1.0' };
    server.setUpdate(update);
    expect(await gm.next('update')).toEqual(update);
  });
});
