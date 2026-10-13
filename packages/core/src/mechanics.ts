import type { Adventure, Encounter, EncounterMechanic, Session } from './model';

/** A mechanic of an encounter that is part of the running fight. */
export interface ActiveMechanic {
  encounter: Encounter;
  mechanic: EncounterMechanic;
  fired: boolean;
}

/** Mechanics of the encounters that have creatures or objects in the initiative list. */
export function activeMechanics(adventure: Adventure, session: Session): ActiveMechanic[] {
  const fighting = new Set(session.initiative.flatMap((c) => c.encounterId ?? []));
  return adventure.encounters
    .filter((encounter) => fighting.has(encounter.id))
    .flatMap((encounter) =>
      encounter.mechanics.map((mechanic) => ({
        encounter,
        mechanic,
        fired: session.firedMechanicIds.includes(mechanic.id),
      })),
    );
}

/** Whether a mechanic's trigger holds in the session right now. Manual ones never fire alone. */
function mechanicTriggered(
  encounter: Encounter,
  mechanic: EncounterMechanic,
  session: Session,
): boolean {
  switch (mechanic.trigger) {
    case 'round':
      return session.combat !== undefined && session.combat.round === mechanic.round;
    case 'bloodied':
    case 'defeated':
      return session.initiative.some((combatant) => {
        const { hp } = combatant;
        if (combatant.encounterId !== encounter.id || combatant.ref !== mechanic.target || !hp) {
          return false;
        }
        return mechanic.trigger === 'defeated' ? hp.current === 0 : hp.current <= hp.max / 2;
      });
    default:
      return false;
  }
}

/**
 * Marks the mechanics whose trigger now holds as fired, so the initiative tracker reminds the game
 * master. Each fires once per combat. Returns the same session when nothing new fired.
 */
export function fireMechanics(adventure: Adventure, session: Session): Session {
  const fired = activeMechanics(adventure, session).filter(
    ({ encounter, mechanic, fired }) => !fired && mechanicTriggered(encounter, mechanic, session),
  );
  if (fired.length === 0) return session;
  return {
    ...session,
    firedMechanicIds: [...session.firedMechanicIds, ...fired.map(({ mechanic }) => mechanic.id)],
  };
}

/** Marks a mechanic as happened, or takes that back, e.g. for one the game master triggers. */
export function toggleMechanic(session: Session, mechanicId: string): Session {
  const fired = session.firedMechanicIds.includes(mechanicId);
  return {
    ...session,
    firedMechanicIds: fired
      ? session.firedMechanicIds.filter((id) => id !== mechanicId)
      : [...session.firedMechanicIds, mechanicId],
  };
}

/**
 * The mechanics of an encounter, with those that watch a creature or object no longer in it
 * handed back to the game master: their trigger becomes "manual". Returns the encounter's own
 * list when nothing changes.
 */
export function releaseMechanicTargets(encounter: Encounter): EncounterMechanic[] {
  const present = new Set([
    ...encounter.monsters.map((m) => m.poolMonsterId),
    ...encounter.objects.map((o) => o.id),
  ]);
  let changed = false;
  const mechanics = encounter.mechanics.map((mechanic): EncounterMechanic => {
    if (mechanic.target === undefined || present.has(mechanic.target)) return mechanic;
    changed = true;
    const { target: _, ...rest } = mechanic;
    return { ...rest, trigger: 'manual' };
  });
  return changed ? mechanics : encounter.mechanics;
}
