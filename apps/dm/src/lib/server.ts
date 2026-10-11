import type { Player } from '@lorewarden/core';
import { ref, shallowRef } from 'vue';
import { loadAuthStatus } from './auth';

// The Lorewarden server on this computer keeps the adventures and serves this app, so every
// request goes to the same origin. In development Vite passes /api on to the server.

export type ServerStatus = 'connecting' | 'connected' | 'offline';

/** Identifies this browser tab, so it can ignore the changes it made itself. */
export const clientId = Math.random().toString(36).slice(2, 12);

export const serverStatus = ref<ServerStatus>('connecting');
/** Whether this app was opened through an address other than this computer's own. */
export const openedRemotely = !['localhost', '127.0.0.1', '[::1]'].includes(
  window.location.hostname,
);

/** Addresses at which phones in the local network open the player app. */
export const joinUrls = ref<string[]>([]);
/** Players with the player app open right now. */
export const onlinePlayers = shallowRef<Player[]>([]);
/** Folder on this computer where the server keeps the adventures. */
export const dataDir = ref('');

export interface UpdateInfo {
  /** The version the server runs; "dev" for a build from source. */
  current: string;
  /** The newest release, when it is newer than the current version. */
  latest?: string;
  /** Release notes of the newest release. */
  url?: string;
}

/** The server's version and whether a newer release is out. */
export const updateInfo = ref<UpdateInfo>({ current: '' });

export interface AdventureChange {
  id: string;
  deleted: boolean;
}

const listeners = new Set<(change: AdventureChange) => void>();
const monsterListeners = new Set<() => void>();
const reconnectListeners = new Set<() => void>();

/** Calls the listener when another tab or program changes or deletes an adventure. */
export function onAdventureChange(listener: (change: AdventureChange) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Calls the listener when another tab or program changes the monster library. */
export function onMonstersChange(listener: () => void): () => void {
  monsterListeners.add(listener);
  return () => monsterListeners.delete(listener);
}

/** Calls the listener whenever the connection to the server is (re)established. */
export function onConnected(listener: () => void): () => void {
  reconnectListeners.add(listener);
  return () => reconnectListeners.delete(listener);
}

function parse<T>(event: Event): T {
  return JSON.parse((event as MessageEvent<string>).data) as T;
}

let source: EventSource | undefined;

/** Opens the event stream once; the browser reconnects on its own when the server restarts. */
export function connectToServer() {
  if (source) return;
  const events = new EventSource('/api/gm/events');
  source = events;
  events.addEventListener('table', (event) => {
    const data = parse<{
      joinUrls: string[];
      players: Player[];
      dataDir: string;
      update?: UpdateInfo;
    }>(event);
    // Opened through its public address, e.g. on a hosted server, phones join there too.
    joinUrls.value = openedRemotely ? [`${window.location.origin}/play/`] : data.joinUrls;
    onlinePlayers.value = data.players;
    dataDir.value = data.dataDir;
    if (data.update) updateInfo.value = data.update;
    serverStatus.value = 'connected';
    for (const listener of reconnectListeners) listener();
  });
  events.addEventListener('update', (event) => {
    updateInfo.value = parse<UpdateInfo>(event);
  });
  events.addEventListener('players', (event) => {
    onlinePlayers.value = parse<{ players: Player[] }>(event).players;
  });
  const change = (deleted: boolean) => (event: Event) => {
    const data = parse<{ id: string; client?: string }>(event);
    if (data.client === clientId) return;
    for (const listener of listeners) listener({ id: data.id, deleted });
  };
  events.addEventListener('adventure', change(false));
  events.addEventListener('adventure-deleted', change(true));
  events.addEventListener('monsters', (event) => {
    if (parse<{ client?: string }>(event).client === clientId) return;
    for (const listener of monsterListeners) listener();
  });
  events.onerror = () => {
    serverStatus.value = 'offline';
    onlinePlayers.value = [];
    // The browser reconnects on its own after a network error, but not after the server turned
    // the stream away, e.g. because this browser was signed out.
    if (events.readyState === EventSource.CLOSED) {
      disconnectFromServer();
      void loadAuthStatus().then((status) => {
        if (status?.access) setTimeout(connectToServer, 3000);
      });
    }
  };
}

export function disconnectFromServer() {
  source?.close();
  source = undefined;
}
