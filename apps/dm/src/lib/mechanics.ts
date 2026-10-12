import {
  type Adventure,
  type Encounter,
  type EncounterMechanic,
  resolvePoolMonster,
} from '@lorewarden/core';

/** Name of a pool monster or object of an encounter, as the game master sees it there. */
export function targetName(adventure: Adventure, encounter: Encounter, id: string): string {
  const object = encounter.objects.find((o) => o.id === id);
  if (object) return object.name;
  const named = encounter.monsters.filter((m) => m.poolMonsterId === id);
  if (named.length === 1 && named[0]?.name) return named[0].name;
  const pool = adventure.monsterPool.find((p) => p.id === id);
  return pool ? resolvePoolMonster(adventure, pool).name : id;
}

/** The pool monsters and objects of an encounter a trigger can watch. */
export function mechanicTargets(
  adventure: Adventure,
  encounter: Encounter,
): { id: string; name: string }[] {
  const ids = [
    ...new Set(encounter.monsters.map((m) => m.poolMonsterId)),
    ...encounter.objects.map((o) => o.id),
  ];
  return ids.map((id) => ({ id, name: targetName(adventure, encounter, id) }));
}

/** Says when a mechanic happens, e.g. "Start of round 3" or "When the Ogre is bloodied". */
export function triggerText(
  t: (key: string, values?: Record<string, unknown>) => string,
  adventure: Adventure,
  encounter: Encounter,
  mechanic: EncounterMechanic,
): string {
  const name = mechanic.target ? targetName(adventure, encounter, mechanic.target) : '?';
  return t(`mechanics.when.${mechanic.trigger}`, { round: mechanic.round ?? '?', name });
}
