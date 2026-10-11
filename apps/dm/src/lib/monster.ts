import type { ResolvedMonster } from '@lorewarden/core';

/** True if there is more to show about a monster than its name, armor class and hit points. */
export function hasMonsterDetails(monster: ResolvedMonster): boolean {
  return Boolean(
    monster.statBlock || monster.attacks || monster.base?.speed || monster.base?.notes,
  );
}
