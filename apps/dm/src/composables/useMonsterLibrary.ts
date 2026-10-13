import type { Monster } from '@lorewarden/core';
import { shallowRef } from 'vue';
import { onConnected, onMonstersChange } from '../lib/server';
import { deleteLibraryMonster, listMonsters, saveLibraryMonster } from '../storage/database';

const monsters = shallowRef<Monster[]>([]);
let started = false;

async function refresh() {
  try {
    monsters.value = await listMonsters();
  } catch {
    // The server is not running; the library loads once it is back.
  }
}

/**
 * The game master's own monsters, kept by the Lorewarden server and shared by every view. Changes
 * an AI assistant or another tab makes appear on their own.
 */
export function useMonsterLibrary() {
  if (!started) {
    started = true;
    void refresh();
    onMonstersChange(() => void refresh());
    onConnected(() => void refresh());
  }

  async function save(monster: Monster) {
    await saveLibraryMonster(monster);
    const others = monsters.value.filter((m) => m.id !== monster.id);
    monsters.value = [...others, JSON.parse(JSON.stringify(monster)) as Monster].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  async function remove(id: string) {
    await deleteLibraryMonster(id);
    monsters.value = monsters.value.filter((m) => m.id !== id);
  }

  return { monsters, save, remove };
}
