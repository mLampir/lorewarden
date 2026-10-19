import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LorewardenServer } from '../src/server';
import { Store } from '../src/store';

// A file that vanishes or cannot be read after the server looked at it.
vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>();
  return {
    ...fs,
    createReadStream: (path: string, ...rest: unknown[]) =>
      String(path).endsWith('vanished.js')
        ? new Readable({
            read() {
              this.destroy(Object.assign(new Error('Gone'), { code: 'ENOENT' }));
            },
          })
        : (fs.createReadStream as (...args: unknown[]) => unknown)(path, ...rest),
  };
});

describe('serving app files', () => {
  let dirs: string[];
  let server: LorewardenServer;
  let port: number;

  beforeEach(async () => {
    const app = mkdtempSync(join(tmpdir(), 'lorewarden-app-'));
    const data = mkdtempSync(join(tmpdir(), 'lorewarden-data-'));
    dirs = [app, data];
    writeFileSync(join(app, 'index.html'), '<!doctype html><title>App</title>');
    writeFileSync(join(app, 'vanished.js'), 'console.log(1)');
    server = new LorewardenServer({ store: new Store(data), playerDir: app, gmDir: app });
    port = await server.listen(0, '127.0.0.1');
  });

  afterEach(async () => {
    await server.close();
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  /** Resolves with the status, or with "aborted" when the answer breaks off. */
  const get = (path: string) =>
    new Promise<number | 'aborted'>((resolve) => {
      const req = request({ port, host: '127.0.0.1', path }, (res) => {
        res.on('data', () => {});
        res.on('end', () => resolve(res.statusCode ?? 0));
        res.on('error', () => resolve('aborted'));
        res.on('aborted', () => resolve('aborted'));
      });
      req.on('error', () => resolve('aborted'));
      req.end();
    });

  it('survives a file that cannot be read while it is sent', async () => {
    await get('/play/vanished.js');
    // The server still answers afterwards.
    expect(await get('/play/')).toBe(200);
  });
});
