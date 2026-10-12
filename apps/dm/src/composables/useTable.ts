import {
  type Adventure,
  addReveal,
  enterPlayerInitiative,
  forgetPlayer,
  hideReveal,
  joinPlayer,
  type Party,
  type Reveal,
  type RevealContent,
  type Session,
  tableState,
} from '@lorewarden/core';
import { computed, onBeforeUnmount, type Ref, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  joinUrls,
  onConnected,
  onlinePlayers,
  onPlayerInitiative,
  serverStatus,
} from '../lib/server';
import { useSettings } from './useSettings';

const ENABLED_KEY = 'lorewarden.tableOn';

function readEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Shows what the game master reveals in live mode on the players' phones. The Lorewarden server
 * tells who has joined; the app sends it what to show whenever that changes.
 */
export function useTable(
  adventure: Ref<Adventure | undefined>,
  session: Ref<Session | undefined>,
  /** The adventure's party, whose characters the players pick when they join. */
  party?: Ref<Party | undefined>,
) {
  const { t } = useI18n();
  const { joinCode } = useSettings();

  const enabled = ref(readEnabled());
  const onlineIds = computed(() => new Set(onlinePlayers.value.map((p) => p.id)));
  /** Who the next reveal goes to. */
  const recipients = ref<Reveal['to']>('all');

  /** Shows the player tools in live mode; the phones stay connected either way. */
  function setEnabled(value: boolean) {
    enabled.value = value;
    try {
      localStorage.setItem(ENABLED_KEY, String(value));
    } catch {
      // Without storage the choice lasts until the page is reloaded.
    }
  }

  // Players who join are remembered in the session, so reveals can be addressed to them. A phone
  // that is still connected comes back into the list, e.g. after an older session's list replaced it.
  watch(
    [onlinePlayers, () => session.value?.id, () => session.value?.players],
    ([players]) => {
      if (!session.value) return;
      let next = session.value;
      for (const player of players) next = joinPlayer(next, player);
      if (next !== session.value) session.value = next;
    },
    { immediate: true },
  );

  // Initiative the players enter on their phones goes straight into the initiative list.
  const stopInitiative = onPlayerInitiative((player, value) => {
    if (session.value) session.value = enterPlayerInitiative(session.value, player, value);
  });
  onBeforeUnmount(stopInitiative);

  /**
   * Changes to what the phones show. Images are compared by id and size rather than content,
   * so a hit point change in the initiative tracker does not copy every image again.
   */
  const signature = computed(() => {
    const a = adventure.value;
    const s = session.value;
    if (!a || !s) return '';
    const assets = a.assets.map((asset) => [asset.id, asset.title, asset.src.length]);
    const puzzles = a.puzzles.filter((p) => s.revealed.some((r) => r.puzzleId === p.id));
    const answers = s.initiativeRequest
      ? s.initiative.flatMap((c) => (c.playerId ? [[c.playerId, c.initiative]] : []))
      : undefined;
    return JSON.stringify([
      s.initiativeRequest,
      answers,
      joinCode.value,
      a.title,
      s.revealed,
      assets,
      puzzles,
      s.solvedPuzzleIds,
      party?.value?.characters.map((c) => [c.id, c.name]),
    ]);
  });

  let lastSent: string | undefined;
  let sending: Promise<void> | undefined;

  async function push(): Promise<void> {
    if (serverStatus.value !== 'connected' || !adventure.value || !session.value) return;
    const current = signature.value;
    if (current === lastSent) return;
    const state = tableState(
      adventure.value,
      session.value,
      joinCode.value,
      t('table.hint'),
      party?.value,
    );
    lastSent = current;
    try {
      const response = await fetch('/api/gm/state', {
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

  // After the server restarts it knows nothing, so it gets everything again.
  const stopConnected = onConnected(() => {
    lastSent = undefined;
    void push();
  });
  onBeforeUnmount(stopConnected);

  /** Reveals to the players chosen in the panel. */
  function reveal(content: RevealContent) {
    if (!session.value) return;
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
    status: serverStatus,
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
