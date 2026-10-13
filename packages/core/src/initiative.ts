import { createId } from './ids';
import type { Adventure, Combatant, Npc, Player, Session } from './model';
import { npcMonster, resolvePoolMonster } from './monsters';

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
  ac?: number;
  ref?: string;
  encounterId?: string;
}

export function createCombatant({
  name,
  kind,
  initiative,
  initiativeBonus,
  initiativeSource,
  hp,
  description,
  ac,
  ref,
  encounterId,
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
    ...(ac !== undefined ? { ac } : {}),
    conditions: [],
    ref,
    ...(encounterId ? { encounterId } : {}),
  };
}

/** Objects such as a crystal shielding the boss are in the list for their hit points only. */
export function takesTurns(combatant: Combatant): boolean {
  return combatant.kind !== 'object';
}

/**
 * Sorts by initiative, highest first, with objects at the end. Ties keep their order, so earlier
 * entries act first.
 */
function sorted(combatants: Combatant[]): Combatant[] {
  const rank = (combatant: Combatant) =>
    takesTurns(combatant) ? combatant.initiative : Number.NEGATIVE_INFINITY;
  return combatants
    .map((combatant, index) => ({ combatant, index }))
    .sort((a, b) => {
      const ra = rank(a.combatant);
      const rb = rank(b.combatant);
      return ra === rb ? a.index - b.index : rb > ra ? 1 : -1;
    })
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
  const next = { ...session, initiative, combat: { round, turn } };
  const active = initiative[turn];
  if (!initiative.some(takesTurns)) return { ...next, combat: undefined };
  return active && !takesTurns(active) ? nextTurn(next) : next;
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
function rollsOnStart(combatant: Combatant): boolean {
  return (
    combatant.kind !== 'pc' &&
    takesTurns(combatant) &&
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
  // Decided once up front: after rolling, every combatant looks rolled.
  const rolling = new Set(
    session.initiative
      .filter((combatant) =>
        chosen ? chosen.has(combatant.id) && takesTurns(combatant) : rollsOnStart(combatant),
      )
      .map((combatant) => combatant.id),
  );
  const rolls = (combatant: Combatant) => rolling.has(combatant.id);
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

/**
 * Reads a typed hit point change: "+5" heals 5, "-5" or a bare "5" deals 5 damage.
 * Returns the signed delta, or undefined when the text is not a whole number above zero.
 */
export function parseHpChange(text: string): number | undefined {
  const match = /^([+\-\u2212\u2013]?)\s*(\d+)$/.exec(text.trim());
  if (!match) return undefined;
  const amount = Number.parseInt(match[2] ?? '', 10);
  if (amount === 0) return undefined;
  return match[1] === '+' ? amount : -amount;
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
  const turn = session.initiative.findIndex(takesTurns);
  if (turn < 0) return session;
  return { ...session, combat: { round: 1, turn }, firedMechanicIds: [] };
}

/**
 * Passes the turn on, past objects, which take no turn. Once the first turn is over, the phones
 * stop asking for initiative.
 */
export function nextTurn(session: Session): Session {
  const { combat } = session;
  if (!combat) return startCombat(session);
  const { initiative } = session;
  if (!initiative.some(takesTurns)) return session;
  const { initiativeRequest: _, ...rest } = session;
  let { round, turn } = combat;
  do {
    turn += 1;
    if (turn >= initiative.length) {
      turn = 0;
      round += 1;
    }
  } while (!takesTurns(initiative[turn] as Combatant));
  return { ...rest, combat: { round, turn } };
}

export function previousTurn(session: Session): Session {
  const { combat } = session;
  const { initiative } = session;
  if (!combat || !initiative.some(takesTurns)) return session;
  let { round, turn } = combat;
  do {
    turn -= 1;
    if (turn < 0) {
      if (round === 1) return session;
      turn = initiative.length - 1;
      round -= 1;
    }
  } while (!takesTurns(initiative[turn] as Combatant));
  return { ...session, combat: { round, turn } };
}

/** Ends the combat. Player characters stay in the list for the next fight, everyone else leaves. */
export function endCombat(session: Session): Session {
  return {
    ...session,
    combat: undefined,
    firedMechanicIds: [],
    initiativeRequest: undefined,
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
  /**
   * Combatants already in the initiative list, so numbers go on from theirs: a second group of
   * goblins starts at "Goblin 3", not at "Goblin 1" again.
   */
  existing?: readonly Combatant[];
  random?: () => number;
}

/** The highest number of each monster name in the list; an unnumbered name counts as 1. */
function highestNumbers(combatants: readonly Combatant[]): Map<string, number> {
  const highest = new Map<string, number>();
  for (const { name, kind } of combatants) {
    if (kind !== 'monster') continue;
    const match = /^(.*) (\d+)$/.exec(name);
    const [label, n] = match ? [match[1] as string, Number(match[2])] : [name, 1];
    highest.set(label, Math.max(highest.get(label) ?? 0, n));
  }
  return highest;
}

/**
 * Creates one combatant per monster of an encounter, numbered when there are several of the same
 * name, here or among `existing`. Monsters with a stat block start with its initiative score
 * (10 plus the modifier), which the SRD 5.2 allows instead of a roll; `rollInitiative` or a typed
 * value replaces it. Monsters the encounter names keep their name and description. Objects of the
 * encounter join without a turn.
 */
export function combatantsFromEncounter(
  adventure: Adventure,
  encounterId: string,
  options: EncounterCombatantOptions = {},
): Combatant[] {
  const { rollHitPoints = false, existing = [], random = Math.random } = options;
  const encounter = adventure.encounters.find((e) => e.id === encounterId);
  if (!encounter) return [];
  const entries = encounter.monsters.flatMap((entry) => {
    const pool = adventure.monsterPool.find((m) => m.id === entry.poolMonsterId);
    if (!pool) return [];
    const resolved = resolvePoolMonster(adventure, pool);
    return [{ entry, pool, resolved, label: entry.name ?? resolved.name }];
  });
  // Numbers run on per name, across the entries of the encounter and the list so far.
  const last = highestNumbers(existing);
  const total = new Map<string, number>();
  for (const { entry, label } of entries) {
    total.set(label, (total.get(label) ?? 0) + entry.count);
  }
  const numbered = (label: string) => (total.get(label) ?? 0) > 1 || last.has(label);
  const monsters = entries.flatMap(({ entry, pool, resolved, label }) => {
    const { count } = entry;
    const { hp, statBlock } = resolved;
    const dice =
      rollHitPoints && count > 1 && pool.overrides.hp === undefined && statBlock
        ? parseDice(statBlock.hitDice)
        : undefined;
    return Array.from({ length: count }, () => {
      let name = label;
      if (numbered(label)) {
        const n = (last.get(label) ?? 0) + 1;
        last.set(label, n);
        name = `${label} ${n}`;
      }
      return createCombatant({
        name,
        kind: 'monster',
        initiative: statBlock ? 10 + statBlock.initiative : 0,
        initiativeBonus: statBlock?.initiative,
        initiativeSource: statBlock ? 'score' : undefined,
        hp: entry.hp ?? (dice ? rollDice(dice, random) : hp),
        description: entry.description?.trim() || undefined,
        ref: pool.id,
        encounterId,
      });
    });
  });
  const objects = encounter.objects.map((object) =>
    createCombatant({
      name: object.name,
      kind: 'object',
      initiative: 0,
      hp: object.hp,
      ac: object.ac,
      description: object.description?.trim() || undefined,
      ref: object.id,
      encounterId,
    }),
  );
  return [...monsters, ...objects];
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

/**
 * The player character whose initiative this player sends, if the list has one: the one linked to
 * the phone, the party character the player picked, or one with the player's name.
 */
export function combatantOfPlayer(session: Session, player: Player): Combatant | undefined {
  const name = player.name.trim().toLocaleLowerCase();
  return (
    session.initiative.find((c) => c.kind === 'pc' && c.playerId === player.id) ??
    (player.characterId
      ? session.initiative.find((c) => c.kind === 'pc' && c.ref === player.characterId)
      : undefined) ??
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

/**
 * Adds an NPC to the initiative. An NPC who fights as a pool monster brings its hit points and
 * starts with its initiative score, like monsters from an encounter.
 */
export function combatantFromNpc(npc: Npc, adventure?: Adventure): Combatant {
  const monster = adventure && npcMonster(adventure, npc);
  const statBlock = monster?.statBlock;
  return createCombatant({
    name: npc.name,
    kind: 'npc',
    initiative: statBlock ? 10 + statBlock.initiative : 0,
    initiativeBonus: statBlock?.initiative,
    initiativeSource: statBlock ? 'score' : undefined,
    hp: monster?.hp,
    ref: npc.id,
  });
}
