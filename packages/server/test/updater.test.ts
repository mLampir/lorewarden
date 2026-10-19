import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { Updater, type UpdaterStatus } from '../src/updater';

const NIGHT = new Date(2026, 9, 13, 3, 30);
const DAY = new Date(2026, 9, 13, 14, 0);

/** A fake updater container that answers like the real one. */
function fakeUpdater(state: UpdaterStatus['state'] = 'idle') {
  const calls: string[] = [];
  const fake = {
    calls,
    request: undefined as unknown as typeof fetch,
    finish: (next: Partial<UpdaterStatus>) => {
      status = { ...status, ...next };
    },
  };
  let status: UpdaterStatus = { state, at: '2026-10-13T03:00:00.000Z' };
  const request = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    calls.push(`${init?.method} ${path}`);
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer secret');
    if (path === '/update') {
      if (status.state === 'running') return new Response(null, { status: 409 });
      status = { state: 'running', step: 'pulling', at: status.at };
      return new Response(null, { status: 202 });
    }
    return Response.json(status);
  });
  fake.request = request as unknown as typeof fetch;
  return fake;
}

function updater(request: typeof fetch, onChange = vi.fn()) {
  const dataDir = mkdtempSync(join(tmpdir(), 'lorewarden-updater-'));
  return {
    dataDir,
    onChange,
    updater: new Updater({
      url: 'http://updater:47617/',
      token: 'secret',
      dataDir,
      onChange,
      fetch: request,
    }),
  };
}

describe('Updater', () => {
  it('asks the updater container to update and reports what it does', async () => {
    const fake = fakeUpdater();
    const { updater: u, onChange } = updater(fake.request);
    expect(await u.start()).toBe('started');
    expect(fake.calls).toEqual(['POST /update', 'GET /status']);
    expect(u.info.status).toMatchObject({ state: 'running', step: 'pulling' });
    expect(onChange).toHaveBeenCalledWith(u.info);
    expect(await u.start()).toBe('busy');
    u.stop();
  });

  it('says when the updater cannot be reached', async () => {
    const request = vi.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const { updater: u } = updater(request);
    expect(await u.start()).toBe('unreachable');
    await u.refresh();
    expect(u.info.status).toBeUndefined();
  });

  it('keeps the automatic update setting in the data folder', () => {
    const fake = fakeUpdater();
    const { updater: u, dataDir } = updater(fake.request);
    expect(u.info.auto).toBe(false);
    u.setAuto(true);
    const again = new Updater({ url: 'http://updater:47617', token: 'secret', dataDir });
    expect(again.info.auto).toBe(true);
  });

  it('updates on its own only at night and when switched on', async () => {
    const fake = fakeUpdater();
    const { updater: u } = updater(fake.request);
    expect(await u.autoUpdate('1.1.0', NIGHT)).toBe(false);
    u.setAuto(true);
    expect(await u.autoUpdate(undefined, NIGHT)).toBe(false);
    expect(await u.autoUpdate('1.1.0', DAY)).toBe(false);
    expect(await u.autoUpdate('1.1.0', NIGHT)).toBe(true);
    // Not while an update runs.
    expect(await u.autoUpdate('1.1.0', NIGHT)).toBe(false);
    expect(fake.calls.filter((call) => call === 'POST /update')).toHaveLength(1);
    u.stop();
  });

  it('tries a release again only if its image was not ready yet', async () => {
    const fake = fakeUpdater();
    const { updater: u } = updater(fake.request);
    u.setAuto(true);
    expect(await u.autoUpdate('1.1.0', NIGHT)).toBe(true);
    fake.finish({ state: 'current', from: '1.0.0', to: '1.0.0' });
    expect(await u.autoUpdate('1.1.0', NIGHT)).toBe(true);
    fake.finish({ state: 'rolled-back', from: '1.0.0', to: '1.1.0' });
    expect(await u.autoUpdate('1.1.0', NIGHT)).toBe(false);
    // The next release is tried again.
    expect(await u.autoUpdate('1.2.0', NIGHT)).toBe(true);
    u.stop();
  });
});
