import { createId } from './ids';
import type { Adventure, Combatant, Npc, Player, Session } from './model';
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
  ref?: string;
}

export function createCombatant({
  name,
  kind,
  initiative,
  initiativeBonus,
  initiativeSource,
  hp,
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

/** Moves to the next turn. Once the first one is over, the phones stop asking for initiative. */
export function nextTurn(session: Session): Session {
  const { combat } = session;
  if (!combat) return startCombat(session);
  const { initiativeRequest: _, ...rest } = session;
  const turn = combat.turn + 1;
  return turn < session.initiative.length
    ? { ...rest, combat: { ...combat, turn } }
    : { ...rest, combat: { round: combat.round + 1, turn: 0 } };
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
    initiativeRequest: undefined,
    initiative: session.initiative
      .filter((combatant) => combatant.kind === 'pc')
      .map((combatant) => ({ ...combatant, conditions: [] })),
  };
}

/**
 * Creates one combatant per monster of an encounter, numbered when there are several. Monsters
 * with a stat block start with its initiative score (10 plus the modifier), which the SRD 5.2
 * allows instead of a roll; `rollInitiative` or a typed value replaces it.
 */
export function combatantsFromEncounter(adventure: Adventure, encounterId: string): Combatant[] {
  const encounter = adventure.encounters.find((e) => e.id === encounterId);
  if (!encounter) return [];
  return encounter.monsters.flatMap(({ poolMonsterId, count }) => {
    const pool = adventure.monsterPool.find((m) => m.id === poolMonsterId);
    if (!pool) return [];
    const { name, hp, statBlock } = resolvePoolMonster(adventure, pool);
    return Array.from({ length: count }, (_, i) =>
      createCombatant({
        name: count > 1 ? `${name} ${i + 1}` : name,
        kind: 'monster',
        initiative: statBlock ? 10 + statBlock.initiative : 0,
        initiativeBonus: statBlock?.initiative,
        initiativeSource: statBlock ? 'score' : undefined,
        hp,
        ref: pool.id,
      }),
    );
  });
}

/** The lowest and highest initiative a player can send from the player app. */
export const PLAYER_INITIATIVE_MIN = -10;
export const PLAYER_INITIATIVE_MAX = 99;

/** Lets the player app ask every player for their initiative. */
export function askForInitiative(session: Session, now: Date = new Date()): Session {
  return { ...session, initiativeRequest: { at: now.toISOString(), answered: [] } };
}

export function stopAskingForInitiative(session: Session): Session {
  if (!session.initiativeRequest) return session;
  const { initiativeRequest: _, ...rest } = session;
  return rest;
}

/** The player character whose initiative this player sends, if the list has one. */
export function combatantOfPlayer(session: Session, player: Player): Combatant | undefined {
  const name = player.name.trim().toLocaleLowerCase();
  return (
    session.initiative.find((c) => c.kind === 'pc' && c.playerId === player.id) ??
    session.initiative.find(
      (c) => c.kind === 'pc' && !c.playerId && c.name.trim().toLocaleLowerCase() === name,
    )
  );
}

/**
 * Takes the initiative a player sent from the player app while the app asks for it. It goes to
 * the player character linked to that player, or else to one with the player's name, which is
 * then linked; without either, the player joins the list. Until the first turn is over the turn
 * stays at the top of the list, so a late high value still acts first.
 */
export function enterPlayerInitiative(session: Session, player: Player, value: number): Session {
  const request = session.initiativeRequest;
  if (!request || !Number.isInteger(value)) return session;
  if (value < PLAYER_INITIATIVE_MIN || value > PLAYER_INITIATIVE_MAX) return session;
  const known = combatantOfPlayer(session, player);
  const entered = { initiative: value, initiativeSource: 'player' as const, playerId: player.id };
  const others = session.initiative.filter((c) => c.id !== known?.id);
  const combatant = known
    ? { ...known, ...entered }
    : { ...createCombatant({ name: player.name, kind: 'pc', initiative: value }), ...entered };
  const answered = request.answered.includes(player.id)
    ? request.answered
    : [...request.answered, player.id];
  // A new value acts after those that already had it, like a roll.
  const initiative = sorted([...others, combatant]);
  const next = { ...session, initiativeRequest: { ...request, answered } };
  const { combat } = session;
  if (combat?.round === 1 && combat.turn === 0) return { ...next, initiative };
  return withInitiative(next, initiative);
}

export function combatantFromNpc(npc: Npc): Combatant {
  return createCombatant({ name: npc.name, kind: 'npc', initiative: 0, ref: npc.id });
}
