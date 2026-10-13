import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RETRY_MAX_MS, retryDelay, useTable } from './table';

/** Stands in for the browser's EventSource, which Node does not have. */
class FakeSource extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static all: FakeSource[] = [];
  readyState = FakeSource.CONNECTING;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    super();
    FakeSource.all.push(this);
  }

  close() {
    this.readyState = FakeSource.CLOSED;
  }

  /** What the browser does when the server answers with an error status: it gives up. */
  refuse() {
    this.readyState = FakeSource.CLOSED;
    this.onerror?.();
  }

  emit(type: string, data: unknown = {}) {
    this.readyState = FakeSource.OPEN;
    this.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data) }));
  }
}

const latest = () => FakeSource.all.at(-1) as FakeSource;

describe('retryDelay', () => {
  it('doubles the wait up to the limit', () => {
    expect([0, 1, 2, 3].map(retryDelay)).toEqual([1000, 2000, 4000, 8000]);
    expect(retryDelay(10)).toBe(RETRY_MAX_MS);
  });
});

describe('useTable', () => {
  let doc: EventTarget & { visibilityState: string };

  beforeEach(() => {
    vi.useFakeTimers();
    FakeSource.all = [];
    doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    vi.stubGlobal('EventSource', FakeSource);
    vi.stubGlobal('window', new EventTarget());
    vi.stubGlobal('document', doc);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('joins again with growing pauses after the server refused', () => {
    const { status, join } = useTable();
    join('ABC123', 'p1', 'Player');
    latest().refuse();
    expect(status.value).toBe('offline');
    expect(FakeSource.all).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(FakeSource.all).toHaveLength(2);
    expect(latest().url).toContain('code=ABC123');
    latest().refuse();
    vi.advanceTimersByTime(1999);
    expect(FakeSource.all).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeSource.all).toHaveLength(3);
    latest().emit('waiting');
    expect(status.value).toBe('waiting');
  });

  it('leaves reconnecting to the browser while it still tries', () => {
    const { join } = useTable();
    join('ABC123', 'p1', 'Player');
    latest().onerror?.();
    vi.advanceTimersByTime(RETRY_MAX_MS);
    expect(FakeSource.all).toHaveLength(1);
  });

  it('does not try again after a wrong code', () => {
    const { status, join } = useTable();
    join('ABC123', 'p1', 'Player');
    const source = latest();
    source.emit('wrong-code');
    source.onerror?.();
    window.dispatchEvent(new Event('online'));
    vi.advanceTimersByTime(RETRY_MAX_MS);
    expect(status.value).toBe('wrong-code');
    expect(FakeSource.all).toHaveLength(1);
  });

  it('tries at once when the phone is back online or on the screen', () => {
    const { join } = useTable();
    join('ABC123', 'p1', 'Player');
    latest().refuse();
    window.dispatchEvent(new Event('online'));
    expect(FakeSource.all).toHaveLength(2);
    latest().refuse();
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(FakeSource.all).toHaveLength(3);
    // The pending attempt was replaced, not added.
    vi.advanceTimersByTime(1000);
    expect(FakeSource.all).toHaveLength(3);
  });

  it('stops trying after leaving', () => {
    const { join, leave } = useTable();
    join('ABC123', 'p1', 'Player');
    latest().refuse();
    leave();
    window.dispatchEvent(new Event('online'));
    vi.advanceTimersByTime(RETRY_MAX_MS);
    expect(FakeSource.all).toHaveLength(1);
  });
});
