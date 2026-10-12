import { createId } from './ids';
import type { Adventure, Combatant, Npc, Session } from './model';
import { resolvePoolMonster } from './monsters';

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
  initiativeBonus?: number;
  initiativeSource?: Combatant['initiativeSource'];
  hp?: number;
  description?: string;
  ref?: string;
}

export function createCombatant({
  name,
  kind,
  initiative,
  initiativeBonus,
  initiativeSource,
  hp,
  description,
  ref,
}: NewCombatant): Combatant {
  return {
    id: createId('cmb'),
    name,
    kind,
    initiative,
    ...(initiativeBonus !== undefined ? { initiativeBonus } : {}),
    ...(initiativeSource ? { initiativeSource } : {}),
    hp: hp !== undefined && hp > 0 ? { current: hp, max: hp } : undefined,
    ...(description ? { description } : {}),
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
  const updated = updateCombatant(session, id, (combatant) => ({
    ...combatant,
    initiative,
    initiativeSource: 'typed' as const,
  }));
  return withInitiative(session, sorted(updated.initiative));
}

/** Returns a whole number from 1 to 20. `random` returns numbers from 0 (inclusive) to 1. */
export function rollD20(random: () => number = Math.random): number {
  return Math.min(20, Math.floor(random() * 20) + 1);
}

export interface RollInitiativeOptions {
  /** Combatants to roll for; by default every monster and NPC, see `rollsOnStart`. */
  ids?: readonly string[];
  /** Monsters from the same pool entry, e.g. "Goblin 1" to "Goblin 4", share one roll. */
  shareRolls?: boolean;
  /**
   * With `shareRolls`, monsters take the roll that others from the same pool entry already
   * have, so reinforcements act together with their group.
   */
  joinExistingRolls?: boolean;
  random?: () => number;
}

/** The d20 a rolled initiative came from, for showing the roll. */
export function initiativeDie(combatant: Combatant): number | undefined {
  return combatant.initiativeSource === 'roll'
    ? combatant.initiative - (combatant.initiativeBonus ?? 0)
    : undefined;
}

/**
 * Whether combat start rolls for this combatant: monsters and NPCs that have neither been
 * rolled for nor been given a typed value. Player characters roll themselves.
 */
export function rollsOnStart(combatant: Combatant): boolean {
  return (
    combatant.kind !== 'pc' &&
    combatant.initiativeSource !== 'roll' &&
    combatant.initiativeSource !== 'typed'
  );
}

/**
 * Rolls d20 plus the initiative bonus for the chosen combatants and sorts the list again,
 * keeping the turn on the same combatant. Without `ids` it rolls for everyone `rollsOnStart`
 * picks.
 */
export function rollInitiative(session: Session, options: RollInitiativeOptions = {}): Session {
  const { ids, shareRolls = false, joinExistingRolls = false, random = Math.random } = options;
  const chosen = ids ? new Set(ids) : undefined;
  const rolls = (combatant: Combatant) =>
    chosen ? chosen.has(combatant.id) : rollsOnStart(combatant);
  const shared = new Map<string, number>();
  if (shareRolls && joinExistingRolls) {
    for (const combatant of session.initiative) {
      const die = initiativeDie(combatant);
      if (combatant.kind !== 'monster' || combatant.ref === undefined || rolls(combatant)) continue;
      if (die !== undefined && !shared.has(combatant.ref)) shared.set(combatant.ref, die);
    }
  }
  let changed = false;
  const initiative = session.initiative.map((combatant) => {
    if (!rolls(combatant)) return combatant;
    const groupKey = shareRolls && combatant.kind === 'monster' ? combatant.ref : undefined;
    let die = groupKey !== undefined ? shared.get(groupKey) : undefined;
    if (die === undefined) {
      die = rollD20(random);
      if (groupKey !== undefined) shared.set(groupKey, die);
    }
    changed = true;
    return {
      ...combatant,
      initiative: die + (combatant.initiativeBonus ?? 0),
      initiativeSource: 'roll' as const,
    };
  });
  if (!changed) return session;
  // On a tie the ones that just rolled act after those that kept their value.
  const kept = initiative.filter((combatant) => !rolls(combatant));
  const rolled = initiative.filter(rolls);
  return withInitiative(session, sorted([...kept, ...rolled]));
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

/** Dice such as "5d8 + 5" from a stat block's hit points. */
export interface Dice {
  count: number;
  sides: number;
  bonus: number;
}

/** Reads dice such as "2d6", "5d8 + 5" or "3d8 − 3"; anything else gives undefined. */
export function parseDice(text: string): Dice | undefined {
  const match = /^\s*(\d+)\s*d\s*(\d+)\s*(?:([+\-−–])\s*(\d+))?\s*$/i.exec(text);
  if (!match) return undefined;
  const [, count = '', sides = '', sign, bonus = '0'] = match;
  const dice = {
    count: Number(count),
    sides: Number(sides),
    bonus: (sign && sign !== '+' ? -1 : 1) * Number(bonus),
  };
  return dice.count > 0 && dice.sides > 0 ? dice : undefined;
}

/** Rolls dice such as a stat block's hit dice. Hit points never drop below 1. */
export function rollDice(dice: Dice, random: () => number = Math.random): number {
  let total = dice.bonus;
  for (let i = 0; i < dice.count; i++) {
    total += Math.min(dice.sides, Math.floor(random() * dice.sides) + 1);
  }
  return Math.max(1, total);
}

export interface EncounterCombatantOptions {
  /**
   * Rolls the hit points of monsters that come in groups from their stat block's hit dice, so
   * they differ. A single monster keeps the stat block's average, so a boss cannot end up with
   * almost no hit points by bad luck. Hit points set in the encounter or the pool always win.
   */
  rollHitPoints?: boolean;
  random?: () => number;
}

/**
 * Creates one combatant per monster of an encounter, numbered when there are several. Monsters
 * with a stat block start with its initiative score (10 plus the modifier), which the SRD 5.2
 * allows instead of a roll; `rollInitiative` or a typed value replaces it. Monsters the encounter
 * names keep their name and description.
 */
export function combatantsFromEncounter(
  adventure: Adventure,
  encounterId: string,
  options: EncounterCombatantOptions = {},
): Combatant[] {
  const { rollHitPoints = false, random = Math.random } = options;
  const encounter = adventure.encounters.find((e) => e.id === encounterId);
  if (!encounter) return [];
  return encounter.monsters.flatMap((entry) => {
    const { poolMonsterId, count } = entry;
    const pool = adventure.monsterPool.find((m) => m.id === poolMonsterId);
    if (!pool) return [];
    const { name, hp, statBlock } = resolvePoolMonster(adventure, pool);
    const dice =
      rollHitPoints && count > 1 && pool.overrides.hp === undefined && statBlock
        ? parseDice(statBlock.hitDice)
        : undefined;
    const label = entry.name ?? name;
    return Array.from({ length: count }, (_, i) =>
      createCombatant({
        name: count > 1 ? `${label} ${i + 1}` : label,
        kind: 'monster',
        initiative: statBlock ? 10 + statBlock.initiative : 0,
        initiativeBonus: statBlock?.initiative,
        initiativeSource: statBlock ? 'score' : undefined,
        hp: entry.hp ?? (dice ? rollDice(dice, random) : hp),
        description: entry.description?.trim() || undefined,
        ref: pool.id,
      }),
    );
  });
}

export function combatantFromNpc(npc: Npc): Combatant {
  return createCombatant({ name: npc.name, kind: 'npc', initiative: 0, ref: npc.id });
}
