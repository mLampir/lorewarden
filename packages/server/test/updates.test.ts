import { describe, expect, it, vi } from 'vitest';
import { isNewer, watchForUpdates } from '../src/updates';

describe('isNewer', () => {
  it('compares release versions part by part', () => {
    expect(isNewer('1.2.0', '1.1.9')).toBe(true);
    expect(isNewer('v1.10.0', '1.9.0')).toBe(true);
    expect(isNewer('2.0.0', '1.99.99')).toBe(true);
    expect(isNewer('1.2.0', '1.2.0')).toBe(false);
    expect(isNewer('1.1.0', '1.2.0')).toBe(false);
  });

  it('never offers an update for a development build or an odd tag', () => {
    expect(isNewer('1.0.0', 'dev')).toBe(false);
    expect(isNewer('1.0.0-beta.1', '0.9.0')).toBe(false);
  });
});

describe('watchForUpdates', () => {
  it('reports a newer release once', async () => {
    const onChange = vi.fn();
    const check = vi.fn(async () => ({ version: '1.1.0', url: 'https://example.org/1.1.0' }));
    const watcher = watchForUpdates('1.0.0', onChange, check);
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledOnce());
    expect(onChange).toHaveBeenCalledWith({
      current: '1.0.0',
      latest: '1.1.0',
      url: 'https://example.org/1.1.0',
    });
    expect(await watcher.check()).toBe('newer');
    expect(onChange).toHaveBeenCalledOnce();
    watcher.stop();
  });

  it('stays quiet when the server is up to date or GitHub cannot be reached', async () => {
    const onChange = vi.fn();
    const upToDate = vi.fn(async () => ({ version: '1.0.0', url: 'https://example.org/1.0.0' }));
    const offline = vi.fn(async () => undefined);
    const watchers = [
      watchForUpdates('1.0.0', onChange, upToDate),
      watchForUpdates('1.0.0', onChange, offline),
    ];
    await vi.waitFor(() => expect(offline).toHaveBeenCalled());
    await vi.waitFor(() => expect(upToDate).toHaveBeenCalled());
    expect(onChange).not.toHaveBeenCalled();
    expect(await watchers[0]?.check()).toBe('current');
    expect(await watchers[1]?.check()).toBe('unreachable');
    for (const watcher of watchers) watcher.stop();
  });
});
