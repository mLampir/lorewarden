import {
  type Adventure,
  addReveal,
  forgetPlayer,
  hideReveal,
  joinPlayer,
  type Player,
  type Reveal,
  type RevealContent,
  type Session,
  tableState,
} from '@lorewarden/core';
import { computed, onBeforeUnmount, type Ref, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSettings } from './useSettings';

const ENABLED_KEY = 'lorewarden.tableOn';

export type TableStatus = 'off' | 'connecting' | 'connected' | 'unreachable';

function readEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Connects live mode with the table server on this computer, which shows what the game master
 * reveals on the players' phones. The server tells who has joined; the app sends what to show.
 */
export function useTable(adventure: Ref<Adventure | undefined>, session: Ref<Session | undefined>) {
  const { t } = useI18n();
  const { tableServer, joinCode } = useSettings();

  const enabled = ref(readEnabled());
  const status = ref<TableStatus>('off');
  const joinUrls = ref<string[]>([]);
  const onlineIds = ref(new Set<string>());
  /** Who the next reveal goes to. */
  const recipients = ref<Reveal['to']>('all');
  let source: EventSource | undefined;

  function setEnabled(value: boolean) {
    enabled.value = value;
    try {
      localStorage.setItem(ENABLED_KEY, String(value));
    } catch {
      // Without storage the choice lasts until the page is reloaded.
    }
  }

  function updatePlayers(players: Player[]) {
    onlineIds.value = new Set(players.map((p) => p.id));
    if (!session.value) return;
    let next = session.value;
    for (const player of players) next = joinPlayer(next, player);
    session.value = next;
  }

  function connect() {
    disconnect();
    status.value = 'connecting';
    const events = new EventSource(`${tableServer.value}/api/gm/events`);
    source = events;
    events.addEventListener('table', (event) => {
      const data = JSON.parse((event as MessageEvent<string>).data) as {
        joinUrls: string[];
        players: Player[];
      };
      joinUrls.value = data.joinUrls;
      status.value = 'connected';
      updatePlayers(data.players);
      lastSent = undefined;
      void push();
    });
    events.addEventListener('players', (event) => {
      updatePlayers(
        (JSON.parse((event as MessageEvent<string>).data) as { players: Player[] }).players,
      );
    });
    // The browser keeps trying, so the panel connects once the server is started.
    events.onerror = () => {
      status.value = 'unreachable';
      onlineIds.value = new Set();
    };
  }

  function disconnect() {
    source?.close();
    source = undefined;
    status.value = 'off';
    onlineIds.value = new Set();
  }

  /**
   * Changes to what the phones show. Images are compared by id and size rather than content,
   * so a hit point change in the initiative tracker does not copy every image again.
   */
  const signature = computed(() => {
    const a = adventure.value;
    const s = session.value;
    if (!a || !s) return '';
    const assets = a.assets.map((asset) => [asset.id, asset.title, asset.src.length]);
    return JSON.stringify([joinCode.value, a.title, s.revealed, assets]);
  });

  let lastSent: string | undefined;
  let sending: Promise<void> | undefined;

  async function push(): Promise<void> {
    if (status.value !== 'connected' || !adventure.value || !session.value) return;
    const current = signature.value;
    if (current === lastSent) return;
    const state = tableState(adventure.value, session.value, joinCode.value, t('table.hint'));
    lastSent = current;
    try {
      const response = await fetch(`${tableServer.value}/api/gm/state`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      });
      if (!response.ok) lastSent = undefined;
    } catch {
      lastSent = undefined;
    }
  }

  watch(signature, () => {
    sending = (sending ?? Promise.resolve()).then(push);
  });

  watch(
    [enabled, tableServer],
    ([on]) => {
      if (on) connect();
      else disconnect();
    },
    { immediate: true },
  );

  onBeforeUnmount(disconnect);

  /** Reveals to the players chosen in the panel. */
  function reveal(content: RevealContent) {
    if (session.value)
      session.value = addReveal(session.value, { ...content, to: recipients.value });
  }

  function hide(revealId: string) {
    if (session.value) session.value = hideReveal(session.value, revealId);
  }

  function forget(playerId: string) {
    if (!session.value) return;
    session.value = forgetPlayer(session.value, playerId);
    if (Array.isArray(recipients.value)) {
      const rest = recipients.value.filter((id) => id !== playerId);
      recipients.value = rest.length > 0 ? rest : 'all';
    }
  }

  return {
    enabled,
    setEnabled,
    status,
    joinUrls,
    joinCode,
    onlineIds,
    recipients,
    reveal,
    hide,
    forget,
  };
}

export type Table = ReturnType<typeof useTable>;
