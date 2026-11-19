import { type Adventure, playedBy, type Session, startSession } from '@lorewarden/core';
import { type Ref, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getLatestSession, saveSession } from '../storage/database';
import { useAutosave } from './useAutosave';

/**
 * The session played in live mode, saved shortly after every change.
 *
 * It continues the latest session of the adventure with its party, or starts the first one. Every
 * party that plays the adventure has its own sessions, so the chronicles stay apart. The prep
 * sheet opens live mode with ?session=new to start afresh; the query is dropped so a reload
 * continues.
 */
export function useLiveSession(adventure: Ref<Adventure | undefined>) {
  const route = useRoute();
  const router = useRouter();

  const session = ref<Session>();
  const { failed: saveFailed, pending, markSaved } = useAutosave(session, saveSession);
  /** The latest session could not be read, so a new one was started; said in a notice. */
  const unreadable = ref(false);

  // Counts the loads, so a slow answer for an adventure opened before is dropped instead of
  // starting a second session.
  let run = 0;
  const playing = (current: Session | undefined, id: string, partyId: string | undefined) =>
    current?.adventureId === id && current.partyId === partyId;

  watch(
    [() => adventure.value?.id, () => adventure.value?.party.partyId],
    async ([id, partyId]) => {
      const value = adventure.value;
      if (!value || !id || playing(session.value, id, partyId)) return;
      // A session played without a party joins the party the adventure is now played with.
      const current = session.value;
      if (current?.adventureId === id && current.partyId === undefined && partyId) {
        session.value = playedBy(current, partyId);
        return;
      }
      const thisRun = ++run;
      let latest: Session | undefined;
      let failed = false;
      try {
        latest = await getLatestSession(id, partyId);
      } catch {
        failed = true;
      }
      if (thisRun !== run || playing(session.value, id, partyId)) return;
      unreadable.value = failed;
      markSaved(latest);
      const fresh = route.query.session === 'new';
      session.value = latest && !fresh ? latest : startSession(value, latest);
      if (fresh) void router.replace({ query: {} });
    },
  );

  /** Starts a new session of the adventure; the one played so far stays in the chronicle. */
  function restart() {
    if (adventure.value) session.value = startSession(adventure.value, session.value);
  }

  return { session, saveFailed, pending, unreadable, restart };
}
