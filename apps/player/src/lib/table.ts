import type { PlayerView } from '@lorewarden/core';
import { ref, shallowRef } from 'vue';

export type TableStatus = 'connecting' | 'offline' | 'waiting' | 'connected' | 'wrong-code';

/**
 * Keeps a connection to the table server open and holds what this player may see.
 * The browser reconnects on its own after the phone slept or the network dropped.
 */
export function useTable() {
  const status = ref<TableStatus>('connecting');
  const view = shallowRef<PlayerView>();
  let source: EventSource | undefined;

  function join(code: string, id: string, name: string) {
    leave();
    status.value = 'connecting';
    const query = new URLSearchParams({ code, id, name });
    const events = new EventSource(`/api/player/events?${query}`);
    source = events;
    events.addEventListener('waiting', () => {
      status.value = 'waiting';
    });
    events.addEventListener('view', (event) => {
      view.value = JSON.parse((event as MessageEvent<string>).data) as PlayerView;
      status.value = 'connected';
    });
    events.addEventListener('wrong-code', () => {
      events.close();
      view.value = undefined;
      status.value = 'wrong-code';
    });
    events.onerror = () => {
      if (status.value !== 'wrong-code') status.value = 'offline';
    };
  }

  function leave() {
    source?.close();
    source = undefined;
    view.value = undefined;
  }

  return { status, view, join, leave };
}
