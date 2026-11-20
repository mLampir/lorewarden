import type { TableInfo } from '@lorewarden/core';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { playerId, read, write } from './storage';
import type { useTable } from './table';

// What the phone keeps for joining again; the sign-up page writes them too.
export const NAME_KEY = 'lorewarden.playerName';
export const CODE_KEY = 'lorewarden.joinCode';
export const CHARACTER_KEY = 'lorewarden.characterId';
/** Set once the phone entered a character of a party, so it can join without the table's code. */
export const SEAT_KEY = 'lorewarden.joinWithParty';
/** How often a phone that entered a character asks whether its party is being played. */
const SEAT_POLL_MS = 10_000;
/** Set when the player leaves, so the next visit asks again instead of joining with the old pick. */
export const LEFT_KEY = 'lorewarden.leftTable';
/** Picked in the character list for a player who plays none of the party's characters. */
export const SOMEONE_ELSE = '';

/**
 * Joining the table: the name, the code and the character the player picks, remembered on the
 * phone so it joins again on its own. A phone that entered a character of the party the game
 * master plays with right now joins with it, without the code.
 *
 * codeFromLink is the code from the QR code's link; with skip (the sign-up page) the phone does
 * not join on its own.
 */
export function useJoin(
  table: Pick<ReturnType<typeof useTable>, 'status' | 'join' | 'leave'>,
  options: { codeFromLink?: string | undefined; skip?: boolean } = {},
) {
  const { status } = table;
  const name = ref(read(NAME_KEY) ?? '');
  const code = ref(options.codeFromLink ?? read(CODE_KEY) ?? '');
  const characterId = ref(read(CHARACTER_KEY) ?? SOMEONE_ELSE);
  const joined = ref(false);

  /** The table behind the code, with the characters a player can pick. */
  const info = ref<TableInfo>();
  const characters = computed(() => info.value?.characters ?? []);
  const picked = computed(() => characters.value.find((c) => c.id === characterId.value));

  async function loadInfo(value: string) {
    info.value = undefined;
    if (!/^[A-Z0-9]{6}$/i.test(value.trim())) return;
    // An answer for a code the player has changed since must not overwrite the current one.
    const current = () => code.value.trim().toUpperCase() === value.trim().toUpperCase();
    try {
      const response = await fetch(`/api/player/table?code=${encodeURIComponent(value.trim())}`);
      if (!response.ok || !current()) return;
      const found = (await response.json()) as TableInfo;
      if (current()) info.value = found;
    } catch {
      // Without the list the player joins with a name, as before.
    }
  }

  watch(code, (value) => void loadInfo(value));

  function submit() {
    const character = picked.value;
    const trimmedName = (character?.name ?? name.value).trim();
    const trimmedCode = code.value.trim().toUpperCase();
    if (!trimmedName || !trimmedCode) return;
    if (!character) write(NAME_KEY, trimmedName);
    write(CODE_KEY, trimmedCode);
    write(CHARACTER_KEY, character?.id ?? null);
    write(LEFT_KEY, null);
    table.join(trimmedCode, playerId(), trimmedName, character?.id);
    joined.value = true;
  }

  /**
   * A phone that entered a character of the party the game master plays with right now joins
   * with that character, without the table's code. Players of other groups join with the code.
   */
  async function joinWithParty(): Promise<boolean> {
    if (joined.value || read(SEAT_KEY) === null) return false;
    try {
      const response = await fetch(`/api/player/seat?id=${encodeURIComponent(playerId())}`);
      if (response.status !== 200) return false;
      const seat = (await response.json()) as { code: string; characterId: string };
      if (joined.value) return false;
      code.value = seat.code;
      await loadInfo(seat.code);
      characterId.value = seat.characterId;
      if (!picked.value) return false;
      submit();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Leaving forgets the code, the party and the character, so the next visit, also with the QR
   * code, shows the join screen again, e.g. to pick another character.
   */
  function leave() {
    table.leave();
    joined.value = false;
    write(CODE_KEY, null);
    write(SEAT_KEY, null);
    write(CHARACTER_KEY, null);
    write(LEFT_KEY, '1');
    code.value = '';
    characterId.value = SOMEONE_ELSE;
  }

  let seatTimer: ReturnType<typeof setInterval> | undefined;
  onUnmounted(() => clearInterval(seatTimer));

  onMounted(async () => {
    if (options.skip) return;
    await loadInfo(code.value);
    if (characterId.value !== SOMEONE_ELSE && !picked.value) characterId.value = SOMEONE_ELSE;
    // Back at the table with the same phone: join right away, unless the player left last time.
    if (read(LEFT_KEY) !== null) return;
    if ((picked.value || name.value.trim()) && code.value.trim()) submit();
    else await joinWithParty();
    // Until the game master starts playing with the party, the join screen keeps asking.
    seatTimer = setInterval(() => void joinWithParty(), SEAT_POLL_MS);
  });

  watch(status, (value) => {
    if (value === 'wrong-code') {
      joined.value = false;
      write(CODE_KEY, null);
      code.value = '';
      // A renewed code: the party still gets the phone to the table.
      void joinWithParty();
    }
  });

  return { name, code, characterId, joined, characters, picked, submit, leave };
}
