import { type Adventure, followParty, leaveParty, partyOf } from '@lorewarden/core';
import { computed, type Ref, watch } from 'vue';
import { useParties } from './useParties';

/**
 * The party an adventure is played with. Size and levels follow the party, e.g. after a level up,
 * so the encounters are rated for the characters as they are now.
 */
export function useAdventureParty(adventure: Ref<Adventure | undefined>) {
  const { parties } = useParties();
  const party = computed(() =>
    adventure.value ? partyOf(adventure.value, parties.value) : undefined,
  );

  // Also after the adventure is loaded again; followParty changes nothing when the numbers fit.
  watch(
    [party, adventure],
    ([value, current]) => {
      if (!current || !value) return;
      const next = followParty(current, value);
      if (next !== current) adventure.value = next;
    },
    { immediate: true },
  );

  /** Plays the adventure with a party, or with none when id is empty. */
  function choose(id: string) {
    const current = adventure.value;
    if (!current) return;
    const chosen = parties.value.find((p) => p.id === id);
    adventure.value = chosen ? followParty(current, chosen) : leaveParty(current);
  }

  return { parties, party, choose };
}
