import type { PlayerView } from '@lorewarden/core';
import { getCurrentScope, onScopeDispose, ref, shallowRef } from 'vue';

/** What the server sends, with the language of rules terms the game master chose. */
export type TableView = PlayerView & { termsLanguage?: string };

export type TableStatus = 'connecting' | 'offline' | 'waiting' | 'connected' | 'wrong-code';

/** The longest pause between two attempts to reach the table again. */
export const RETRY_MAX_MS = 30_000;

/** Waits 1, 2, 4, 8 … seconds before the next attempt, at most {@link RETRY_MAX_MS}. */
export function retryDelay(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, RETRY_MAX_MS);
}

/**
 * Keeps a connection to the table server open and holds what this player may see.
 * The browser reconnects on its own after the phone slept or the network dropped. When the server
 * answers with an error instead (too many attempts, too many players, a proxy while Lorewarden
 * restarts), the browser gives up, so the phone tries again itself, waiting longer each time.
 */
export function useTable() {
  const status = ref<TableStatus>('connecting');
  const view = shallowRef<TableView>();
  let source: EventSource | undefined;
  let joinedAs: { code: string; id: string } | undefined;
  let query: URLSearchParams | undefined;
  let attempts = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  function connect() {
    if (!query) return;
    const events = new EventSource(`/api/player/events?${query}`);
    source = events;
    events.addEventListener('waiting', () => {
      attempts = 0;
      status.value = 'waiting';
    });
    events.addEventListener('view', (event) => {
      attempts = 0;
      view.value = JSON.parse((event as MessageEvent<string>).data) as TableView;
      status.value = 'connected';
    });
    // A wrong or old code is a final answer: the phone does not try again with it.
    events.addEventListener('wrong-code', () => {
      events.close();
      if (source === events) source = undefined;
      stopRetry();
      view.value = undefined;
      status.value = 'wrong-code';
    });
    events.onerror = () => {
      if (source !== events || status.value === 'wrong-code') return;
      status.value = 'offline';
      if (events.readyState === EventSource.CLOSED) scheduleRetry();
    };
  }

  function scheduleRetry() {
    if (retryTimer !== undefined) return;
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      reconnect();
    }, retryDelay(attempts));
    attempts += 1;
  }

  function stopRetry() {
    clearTimeout(retryTimer);
    retryTimer = undefined;
  }

  /** Opens the connection again if the browser gave up on it. */
  function reconnect() {
    if (!source || source.readyState !== EventSource.CLOSED) return;
    stopRetry();
    connect();
  }

  // Back on the screen or back online: try at once instead of waiting for the next attempt.
  function onVisibility() {
    if (document.visibilityState === 'visible') reconnect();
  }
  window.addEventListener('online', reconnect);
  document.addEventListener('visibilitychange', onVisibility);
  if (getCurrentScope()) {
    onScopeDispose(() => {
      leave();
      window.removeEventListener('online', reconnect);
      document.removeEventListener('visibilitychange', onVisibility);
    });
  }

  function join(code: string, id: string, name: string, character?: string) {
    leave();
    joinedAs = { code, id };
    query = new URLSearchParams({ code, id, name, ...(character ? { character } : {}) });
    status.value = 'connecting';
    connect();
  }

  function leave() {
    stopRetry();
    source?.close();
    source = undefined;
    joinedAs = undefined;
    query = undefined;
    attempts = 0;
    view.value = undefined;
  }

  /** Sends the initiative the player entered to the game master. Returns whether it arrived. */
  async function sendInitiative(value: number): Promise<boolean> {
    if (!joinedAs) return false;
    try {
      const response = await fetch('/api/player/initiative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...joinedAs, value }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  return { status, view, join, leave, sendInitiative };
}
