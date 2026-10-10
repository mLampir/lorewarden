import { createId } from './ids';
import type { Adventure, Combatant, Npc, Session } from './model';

/** Condition keys from the SRD glossary. The apps translate them for display. */
export const CONDITIONS = [
  'blinded',
  'charmed',
  'deafened',
  'exhaustion',
  'frightened',
  'grappled',
  'incapacitated',
  'invisible',
  'paralyzed',
  'petrified',
  'poisoned',
  'prone',
  'restrained',
  'stunned',
  'unconscious',
] as const;

export type Condition = (typeof CONDITIONS)[number];

export interface NewCombatant {
  name: string;
  kind: Combatant['kind'];
  initiative: number;
  hp?: number;
  ref?: string;
}

export function createCombatant({ name, kind, initiative, hp, ref }: NewCombatant): Combatant {
  return {
    id: createId('cmb'),
    name,
    kind,
    initiative,
    hp: hp !== undefined && hp > 0 ? { current: hp, max: hp } : undefined,
    conditions: [],
    ref,
  };
}

/** Sorts by initiative, highest first. Ties keep their order, so earlier entries act first. */
function sorted(combatants: Combatant[]): Combatant[] {
  return combatants
    .map((combatant, index) => ({ combatant, index }))
    .sort((a, b) => b.combatant.initiative - a.combatant.initiative || a.index - b.index)
    .map(({ combatant }) => combatant);
}

/** Replaces the initiative list while keeping the turn on the same combatant. */
function withInitiative(session: Session, initiative: Combatant[]): Session {
  const { combat } = session;
  if (!combat) return { ...session, initiative };
  if (initiative.length === 0) return { ...session, initiative, combat: undefined };
  const activeId = session.initiative[combat.turn]?.id;
  const turn = initiative.findIndex((combatant) => combatant.id === activeId);
  return {
    ...session,
    initiative,
    combat: { ...combat, turn: turn >= 0 ? turn : Math.min(combat.turn, initiative.length - 1) },
  };
}

function updateCombatant(
  session: Session,
  id: string,
  change: (combatant: Combatant) => Combatant,
): Session {
  return {
    ...session,
    initiative: session.initiative.map((combatant) =>
      combatant.id === id ? change(combatant) : combatant,
    ),
  };
}

export function addCombatants(session: Session, combatants: Combatant[]): Session {
  return withInitiative(session, sorted([...session.initiative, ...combatants]));
}

export function removeCombatant(session: Session, id: string): Session {
  const index = session.initiative.findIndex((combatant) => combatant.id === id);
  if (index < 0) return session;
  const initiative = session.initiative.filter((combatant) => combatant.id !== id);
  const { combat } = session;
  if (!combat || initiative.length === 0) {
    return { ...session, initiative, combat: initiative.length === 0 ? undefined : combat };
  }
  // Removing the active combatant passes the turn to the next one in line.
  let turn = index < combat.turn ? combat.turn - 1 : combat.turn;
  let round = combat.round;
  if (turn >= initiative.length) {
    turn = 0;
    round += 1;
  }
  return { ...session, initiative, combat: { round, turn } };
}

export function setInitiative(session: Session, id: string, initiative: number): Session {
  const updated = updateCombatant(session, id, (combatant) => ({ ...combatant, initiative }));
  return withInitiative(session, sorted(updated.initiative));
}

export function renameCombatant(session: Session, id: string, name: string): Session {
  const trimmed = name.trim();
  if (trimmed === '') return session;
  return updateCombatant(session, id, (combatant) => ({ ...combatant, name: trimmed }));
}

/** Changes hit points by delta (negative for damage), staying between 0 and the maximum. */
export function adjustHp(session: Session, id: string, delta: number): Session {
  return updateCombatant(session, id, (combatant) => {
    if (!combatant.hp) return combatant;
    const current = Math.min(combatant.hp.max, Math.max(0, combatant.hp.current + delta));
    return { ...combatant, hp: { ...combatant.hp, current } };
  });
}

export function toggleCondition(session: Session, id: string, condition: string): Session {
  return updateCombatant(session, id, (combatant) => ({
    ...combatant,
    conditions: combatant.conditions.includes(condition)
      ? combatant.conditions.filter((c) => c !== condition)
      : [...combatant.conditions, condition],
  }));
}

export function startCombat(session: Session): Session {
  if (session.initiative.length === 0) return session;
  return { ...session, combat: { round: 1, turn: 0 } };
}

export function nextTurn(session: Session): Session {
  const { combat } = session;
  if (!combat) return startCombat(session);
  const turn = combat.turn + 1;
  return turn < session.initiative.length
    ? { ...session, combat: { ...combat, turn } }
    : { ...session, combat: { round: combat.round + 1, turn: 0 } };
}

export function previousTurn(session: Session): Session {
  const { combat } = session;
  if (!combat || (combat.round === 1 && combat.turn === 0)) return session;
  return combat.turn > 0
    ? { ...session, combat: { ...combat, turn: combat.turn - 1 } }
    : {
        ...session,
        combat: { round: combat.round - 1, turn: Math.max(0, session.initiative.length - 1) },
      };
}

/** Ends the combat. Player characters stay in the list for the next fight, everyone else leaves. */
export function endCombat(session: Session): Session {
  return {
    ...session,
    combat: undefined,
    initiative: session.initiative
      .filter((combatant) => combatant.kind === 'pc')
      .map((combatant) => ({ ...combatant, conditions: [] })),
  };
}

/** Creates one combatant per monster of an encounter, numbered when there are several. */
export function combatantsFromEncounter(adventure: Adventure, encounterId: string): Combatant[] {
  const encounter = adventure.encounters.find((e) => e.id === encounterId);
  if (!encounter) return [];
  return encounter.monsters.flatMap(({ poolMonsterId, count }) => {
    const pool = adventure.monsterPool.find((m) => m.id === poolMonsterId);
    if (!pool) return [];
    const base = adventure.monsters.find((m) => m.id === pool.baseMonsterRef);
    const name = pool.overrides.name ?? pool.name;
    const hp = pool.overrides.hp ?? base?.hp;
    return Array.from({ length: count }, (_, i) =>
      createCombatant({
        name: count > 1 ? `${name} ${i + 1}` : name,
        kind: 'monster',
        initiative: 0,
        hp,
        ref: pool.id,
      }),
    );
  });
}

export function combatantFromNpc(npc: Npc): Combatant {
  return createCombatant({ name: npc.name, kind: 'npc', initiative: 0, ref: npc.id });
}
