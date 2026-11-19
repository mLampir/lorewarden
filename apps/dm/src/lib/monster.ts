import {
  type Adventure,
  findSrdMonster,
  type Monster,
  monsterStatBlock,
  type ResolvedMonster,
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
