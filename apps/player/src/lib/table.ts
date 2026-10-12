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
  let joinedAs: { code: string; id: string } | undefined;

  function join(code: string, id: string, name: string, character?: string) {
    leave();
    joinedAs = { code, id };
    status.value = 'connecting';
    const query = new URLSearchParams({ code, id, name, ...(character ? { character } : {}) });
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
    joinedAs = undefined;
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
