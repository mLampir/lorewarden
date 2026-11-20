import {
  type Adventure,
  type Combatant,
  findSrdMonster,
  formatChallengeRating,
  type Monster,
  monsterStatBlock,
  npcMonster,
  type ResolvedMonster,
  resolvePoolMonster,
} from '@lorewarden/core';

/** True if there is more to show about a monster than its name, armor class and hit points. */
export function hasMonsterDetails(monster: ResolvedMonster): boolean {
  return Boolean(monster.statBlock || monster.attacks);
}

/**
 * A monster of the adventure, the game master's library or the SRD by its id, e.g. one added to
 * the initiative from the quick search. Monsters of the adventure come first.
 */
export function monsterById(
  adventure: Pick<Adventure, 'monsters'> | undefined,
  library: readonly Monster[],
  id: string | undefined,
): ResolvedMonster | undefined {
  if (id === undefined) return undefined;
  const base = adventure?.monsters.find((m) => m.id === id) ?? library.find((m) => m.id === id);
  const statBlock = base ? monsterStatBlock(base) : findSrdMonster(id);
  if (!statBlock) return undefined;
  const { name, cr, hp, ac } = statBlock;
  return base ? { name, cr, hp, ac, statBlock, base } : { name, cr, hp, ac, statBlock };
}

/**
 * The stat block and attacks of a combatant: an NPC who fights as one, a monster of an encounter
 * or a monster added on its own, e.g. from the quick search. Undefined for player characters.
 */
export function combatantMonster(
  adventure: Adventure,
  library: readonly Monster[],
  combatant: Pick<Combatant, 'kind' | 'ref'>,
): ResolvedMonster | undefined {
  if (combatant.kind === 'npc') {
    const npc = adventure.npcs.find((n) => n.id === combatant.ref);
    return npc && npcMonster(adventure, npc);
  }
  if (combatant.kind !== 'monster') return undefined;
  const pool = adventure.monsterPool.find((m) => m.id === combatant.ref);
  return pool
    ? resolvePoolMonster(adventure, pool)
    : monsterById(adventure, library, combatant.ref);
}

/**
 * Armor class and hit points at a glance, e.g. "AC 13 · HP 11", with the challenge rating when
 * it is given. term translates the rules terms as the settings say.
 */
export function quickStats(
  term: (key: string) => string,
  stats: { ac?: number | undefined; hp?: number | undefined; cr?: number | undefined },
): string {
  return [
    stats.ac !== undefined ? `${term('statBlock.ac')} ${stats.ac}` : '',
    stats.hp !== undefined ? `${term('statBlock.hp')} ${stats.hp}` : '',
    stats.cr !== undefined ? `${term('statBlock.cr')} ${formatChallengeRating(stats.cr)}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
