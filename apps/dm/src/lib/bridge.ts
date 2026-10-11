import { Adventure, type Session } from '@lorewarden/core';
import { ref, watch } from 'vue';
import { adventureLanguages } from '../composables/useSettings';
import {
  getAllAdventures,
  getLatestSessions,
  onStorageChange,
  saveAdventure,
} from '../storage/database';

// Connection to the Lorewarden MCP server on this computer, so an AI assistant such as Claude
// Desktop works on the adventures in this browser and sees what happens at the table.
// Nothing leaves this computer: the server only listens on 127.0.0.1.

export const DEFAULT_BRIDGE_PORT = 47615;
const ENABLED_KEY = 'lorewarden.aiBridge';
const PORT_KEY = 'lorewarden.aiBridgePort';

export type BridgeStatus = 'off' | 'waiting' | 'connected';

export const bridgeStatus = ref<BridgeStatus>('off');

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Without storage the setting lasts until the page is reloaded.
  }
}

export function bridgeSettings(): { enabled: boolean; port: number } {
  const port = Number(read(PORT_KEY));
  return {
    enabled: read(ENABLED_KEY) === 'true',
    port: Number.isInteger(port) && port > 0 && port < 65536 ? port : DEFAULT_BRIDGE_PORT,
  };
}

export function saveBridgeSettings(settings: { enabled: boolean; port: number }) {
  write(ENABLED_KEY, String(settings.enabled));
  write(PORT_KEY, String(settings.port));
  if (settings.enabled) startBridge(settings.port);
  else stopBridge();
}

let source: EventSource | undefined;
let stopListening: (() => void) | undefined;
let base = '';

async function send(method: string, path: string, body?: unknown) {
  if (bridgeStatus.value !== 'connected') return;
  try {
    await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // The server went away; the event stream reconnects and sends everything again.
  }
}

export function startBridge(port: number) {
  stopBridge();
  base = `http://127.0.0.1:${port}`;
  bridgeStatus.value = 'waiting';
  source = new EventSource(`${base}/events`);

  source.addEventListener('hello', async () => {
    const [adventures, sessions] = await Promise.all([getAllAdventures(), getLatestSessions()]);
    bridgeStatus.value = 'connected';
    await send('POST', '/sync', {
      adventures,
      sessions,
      settings: adventureLanguages(),
      activeAdventureId: activeSession?.adventureId,
    });
    if (activeSession) await send('PUT', '/session', { session: activeSession });
  });

  source.addEventListener('adventure', async (event) => {
    try {
      const parsed = Adventure.safeParse(
        JSON.parse((event as MessageEvent<string>).data).adventure,
      );
      if (parsed.success) await saveAdventure(parsed.data, true);
    } catch {
      // A broken message changes nothing; the server only sends checked adventures.
    }
  });

  // The browser keeps trying to reconnect, e.g. while Claude Desktop is closed.
  source.onerror = () => {
    bridgeStatus.value = 'waiting';
  };

  // The AI assistant writes new adventures in the languages chosen here.
  const stopWatching = watch(
    adventureLanguages,
    (settings) => void send('PUT', '/settings', { settings }),
    {
      deep: true,
    },
  );
  const stopStorage = onStorageChange((change) => {
    if (change.kind === 'adventure' && !change.external) {
      void send('PUT', `/adventures/${encodeURIComponent(change.adventure.id)}`, {
        adventure: change.adventure,
      });
    } else if (change.kind === 'adventureDeleted') {
      void send('DELETE', `/adventures/${encodeURIComponent(change.id)}`);
    } else if (change.kind === 'session') {
      shareSession(change.session);
    }
  });
  stopListening = () => {
    stopWatching();
    stopStorage();
  };
}

export function stopBridge() {
  source?.close();
  source = undefined;
  stopListening?.();
  stopListening = undefined;
  bridgeStatus.value = 'off';
}

let activeSession: Session | undefined;

/** Tells the AI assistant which adventure is being played and where the party is. */
export function shareSession(session: Session) {
  activeSession = JSON.parse(JSON.stringify(session)) as Session;
  void send('PUT', '/session', { session: activeSession });
}
