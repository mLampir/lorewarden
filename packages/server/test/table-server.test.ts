import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PlayerView, TableState } from '@lorewarden/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TableServer } from '../src/table-server';

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

describe('table server', () => {
  let server: TableServer;
  let base: string;
  let playerDir: string;
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

  beforeEach(async () => {
    playerDir = mkdtempSync(join(tmpdir(), 'lorewarden-player-'));
    writeFileSync(join(playerDir, 'index.html'), '<!doctype html><title>Player</title>');
    writeFileSync(join(playerDir, 'app.js'), 'console.log(1)');
    server = new TableServer({ playerDir });
    const port = await server.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    for (const stream of streams.splice(0)) stream.close();
    await server.close();
    rmSync(playerDir, { recursive: true, force: true });
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
    const local = await putState(state, { Origin: 'http://localhost:5173' });
    expect(local.status).toBe(204);
    expect(local.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
  });

  it('serves the player app and keeps out of other folders', async () => {
    const index = await fetch(`${base}/`);
    expect(await index.text()).toContain('<title>Player</title>');
    expect(index.headers.get('cache-control')).toBe('no-cache');
    expect(await (await fetch(`${base}/app.js`)).text()).toBe('console.log(1)');
    expect(await (await fetch(`${base}/join/anything`)).text()).toContain('Player');
    const outside = await fetch(`${base}/%2e%2e/%2e%2e/etc/passwd`);
    expect(await outside.text()).not.toContain('root:');
  });
});
