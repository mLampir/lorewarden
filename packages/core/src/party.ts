import { z } from 'zod';
import { createId } from './ids';
import { createCombatant } from './initiative';
import { type Adventure, type Combatant, Id } from './model';
import { JoinCode } from './table';

// The party: the player characters a group plays with, kept next to the game master's own
// monsters so every adventure the group plays can use them. Not a character sheet: only what the
// game master needs at the table. Players keep their characters in their own tools.

export const PlayerCharacter = z.object({
  id: Id,
  name: z.string().trim().min(1).max(60),
  /** First name or nickname of the player, to tell who plays whom. */
  player: z.string().trim().max(40).optional(),
  /** Class and subclass as the player says it, e.g. "Ranger" or "Fighter 3 / Rogue 2". */
  className: z.string().trim().max(60).default(''),
  level: z.number().int().min(1).max(20).default(1),
  ac: z.number().int().nonnegative().optional(),
  maxHp: z.number().int().positive().optional(),
  passivePerception: z.number().int().optional(),
  initiativeBonus: z.number().int().optional(),
  /** For the game master only: what the player enjoys, background hooks, open threads, limits. */
  notes: z.string().default(''),
  /** What the player wrote when they entered the character on their phone. */
  playerNotes: z.string().max(2000).default(''),
  /**
   * The phone that entered the character, so only that phone can change it. Never sent to
   * other phones.
   */
  ownerId: z.string().max(64).optional(),
});

export const Party = z.object({
  id: Id,
  name: z.string().trim().min(1).max(60),
  characters: z.array(PlayerCharacter).default([]),
  /** Set while players may enter their characters with the sign-up link. */
  signUpCode: JoinCode.optional(),
});

export type PlayerCharacter = z.infer<typeof PlayerCharacter>;
export type Party = z.infer<typeof Party>;

export function createParty(name: string): Party {
  return { id: createId('party'), name, characters: [] };
}

export function createCharacter(name: string, level = 1): PlayerCharacter {
  return { id: createId('pc'), name, className: '', level, notes: '', playerNotes: '' };
}

/** Size and level of a party for the XP budget; the level is the average, rounded. */
export function partyNumbers(party: Party): Adventure['party'] {
  const levels = party.characters.map((c) => c.level);
  if (levels.length === 0) return { size: 1, level: 1, partyId: party.id };
  const average = Math.round(levels.reduce((sum, level) => sum + level, 0) / levels.length);
  return {
    size: levels.length,
    level: Math.min(Math.max(average, 1), 20),
    // Only needed when the levels differ; the budget then adds up each character's share.
    ...(levels.some((level) => level !== levels[0]) ? { levels } : {}),
    partyId: party.id,
  };
}

/**
 * Lets the adventure follow its party: size and levels come from the characters. The game
 * master's free-text notes on the characters stay. Returns the adventure itself when nothing
 * changes, so nothing is saved needlessly.
 */
export function followParty(adventure: Adventure, party: Party): Adventure {
  const numbers = partyNumbers(party);
  const current = adventure.party;
  const same =
    current.partyId === numbers.partyId &&
    current.size === numbers.size &&
    current.level === numbers.level &&
    JSON.stringify(current.levels) === JSON.stringify(numbers.levels);
  if (same) return adventure;
  const { levels: _, ...rest } = current;
  return { ...adventure, party: { ...rest, ...numbers } };
}

/** A party without the sign-up code and the ids of the phones, for AI assistants. */
export function partyWithoutPhones(party: Party): Party {
  const { signUpCode: _, ...rest } = party;
  return { ...rest, characters: party.characters.map(({ ownerId: __, ...c }) => c) };
}

/** Unlinks the adventure from its party; size and level stay as they were. */
export function leaveParty(adventure: Adventure): Adventure {
  const { partyId: _, levels: __, ...party } = adventure.party;
  return { ...adventure, party };
}

/** The party an adventure is played with, if it has one and it still exists. */
export function partyOf(adventure: Adventure, parties: readonly Party[]): Party | undefined {
  const id = adventure.party.partyId;
  return id ? parties.find((party) => party.id === id) : undefined;
}

/** One line per character for AI instructions, e.g. "- Mira (Anna): Ranger, level 3, AC 15". */
export function describeCharacters(party: Party): string {
  return party.characters
    .map((c) => {
      const stats = [
        c.className,
        `level ${c.level}`,
        c.ac !== undefined ? `AC ${c.ac}` : '',
        c.maxHp !== undefined ? `${c.maxHp} HP` : '',
        c.passivePerception !== undefined ? `passive Perception ${c.passivePerception}` : '',
      ].filter(Boolean);
      const notes = c.notes.trim().replace(/\s*\n\s*/g, '; ');
      const wrote = c.playerNotes.trim().replace(/\s*\n\s*/g, '; ');
      return `- ${c.name}${c.player ? ` (${c.player})` : ''}: ${stats.join(', ')}${notes ? `. ${notes}` : ''}${wrote ? `. The player wrote: ${wrote}` : ''}`;
    })
    .join('\n');
}

/**
 * The characters of a party for the initiative tracker, with armor class and, if the game master
 * tracks them, hit points. Characters already in the list are left out. Players roll their own
 * initiative.
 */
export function combatantsFromParty(
  party: Party,
  initiative: readonly Combatant[],
  { trackHitPoints = false }: { trackHitPoints?: boolean } = {},
): Combatant[] {
  const present = new Set(initiative.map((c) => c.ref));
  return party.characters
    .filter((c) => !present.has(c.id))
    .map((c) =>
      createCombatant({
        name: c.name,
        kind: 'pc',
        initiative: 0,
        ...(c.initiativeBonus !== undefined ? { initiativeBonus: c.initiativeBonus } : {}),
        ...(trackHitPoints && c.maxHp !== undefined ? { hp: c.maxHp } : {}),
        ...(c.ac !== undefined ? { ac: c.ac } : {}),
        ref: c.id,
      }),
    );
}

// --- Sign-up from the players' phones ----------------------------------------------------------

/** Most characters a party can have, so a sign-up link cannot fill the file. */
export const MAX_PARTY_CHARACTERS = 12;
/** Most characters one phone can enter. */
export const MAX_CHARACTERS_PER_PLAYER = 3;

/** What a player enters about their character. The game master's notes are not part of it. */
export const SignUpCharacter = z.object({
  name: PlayerCharacter.shape.name,
  player: PlayerCharacter.shape.player,
  className: PlayerCharacter.shape.className,
  level: PlayerCharacter.shape.level,
  ac: z.number().int().min(0).max(40).optional(),
  maxHp: z.number().int().min(1).max(999).optional(),
  passivePerception: z.number().int().min(-10).max(40).optional(),
  initiativeBonus: z.number().int().min(-10).max(20).optional(),
  playerNotes: PlayerCharacter.shape.playerNotes,
});

/** What a phone sends: a new character, or a change to one it entered before (with its id). */
export const SignUpRequest = z.object({
  code: JoinCode,
  /** The phone's player id. */
  id: z.string().min(1).max(64),
  characterId: Id.max(64).optional(),
  character: SignUpCharacter,
});

/** What a phone sees on the sign-up screen: its own characters in full, the others by name. */
export const SignUpView = z.object({
  party: z.string(),
  mine: z.array(SignUpCharacter.extend({ id: Id })),
  others: z.array(z.object({ name: z.string(), className: z.string(), level: z.number() })),
  /** Whether this phone may still add a character. */
  canAdd: z.boolean(),
});

export type SignUpCharacter = z.infer<typeof SignUpCharacter>;
export type SignUpRequest = z.infer<typeof SignUpRequest>;
export type SignUpView = z.infer<typeof SignUpView>;

function canAdd(party: Party, playerId: string): boolean {
  const own = party.characters.filter((c) => c.ownerId === playerId).length;
  return party.characters.length < MAX_PARTY_CHARACTERS && own < MAX_CHARACTERS_PER_PLAYER;
}

export function signUpView(party: Party, playerId: string): SignUpView {
  const mine = party.characters
    .filter((c) => c.ownerId === playerId)
    .map(
      ({
        id,
        name,
        player,
        className,
        level,
        ac,
        maxHp,
        passivePerception,
        initiativeBonus,
        playerNotes,
      }) => ({
        id,
        name,
        ...(player ? { player } : {}),
        className,
        level,
        playerNotes,
        ...(ac !== undefined ? { ac } : {}),
        ...(maxHp !== undefined ? { maxHp } : {}),
        ...(passivePerception !== undefined ? { passivePerception } : {}),
        ...(initiativeBonus !== undefined ? { initiativeBonus } : {}),
      }),
    );
  const others = party.characters
    .filter((c) => c.ownerId !== playerId)
    .map(({ name, className, level }) => ({ name, className, level }));
  return { party: party.name, mine, others, canAdd: canAdd(party, playerId) };
}

/**
 * Adds a character a player entered, or changes one the same phone entered before. Returns
 * undefined when the phone may not do that: the character belongs to someone else, or the party
 * or the phone has as many characters as it may have. The game master's notes stay as they are.
 */
export function applySignUp(
  party: Party,
  playerId: string,
  request: Pick<SignUpRequest, 'characterId' | 'character'>,
): { party: Party; characterId: string } | undefined {
  const entered = SignUpCharacter.parse(request.character);
  if (request.characterId) {
    const known = party.characters.find((c) => c.id === request.characterId);
    if (!known || known.ownerId !== playerId) return undefined;
    const {
      player: _n,
      ac: _a,
      maxHp: _h,
      passivePerception: _p,
      initiativeBonus: _i,
      ...rest
    } = known;
    const changed: PlayerCharacter = { ...rest, ...entered };
    return {
      party: {
        ...party,
        characters: party.characters.map((c) => (c.id === known.id ? changed : c)),
      },
      characterId: known.id,
    };
  }
  if (!canAdd(party, playerId)) return undefined;
  const character: PlayerCharacter = {
    ...createCharacter(entered.name, entered.level),
    ...entered,
    ownerId: playerId,
  };
  return {
    party: { ...party, characters: [...party.characters, character] },
    characterId: character.id,
  };
}

/**
 * Brings what players entered on their phones into the copy of a party the game master is
 * editing: new characters are added, and changes to characters a phone entered replace the
 * player's fields. The game master's notes stay. Returns local itself when nothing changes.
 */
export function takeSignUps(local: Party, stored: Party): Party {
  const fromPhones = stored.characters.filter((c) => c.ownerId !== undefined);
  let changed = false;
  const characters = local.characters.map((character) => {
    const entered = fromPhones.find((c) => c.id === character.id);
    if (!entered) return character;
    const merged = { ...entered, notes: character.notes };
    if (sameFields(merged, character)) return character;
    changed = true;
    return merged;
  });
  for (const entered of fromPhones) {
    if (characters.some((c) => c.id === entered.id)) continue;
    characters.push(entered);
    changed = true;
  }
  return changed ? { ...local, characters } : local;
}

function sameFields(a: PlayerCharacter, b: PlayerCharacter): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof PlayerCharacter>;
  return [...keys].every((key) => a[key] === b[key]);
}

// --- Party library ---------------------------------------------------------------------------

export const PARTY_LIBRARY_FORMAT = 'lorewarden.parties';
export const PARTY_LIBRARY_VERSION = 1;
/** File in the Lorewarden folder that holds the game master's parties. */
export const PARTY_LIBRARY_FILE = 'parties.json';

const PartyLibraryFile = z.object({
  format: z.literal(PARTY_LIBRARY_FORMAT),
  version: z.literal(PARTY_LIBRARY_VERSION),
  parties: z.array(z.unknown()).default([]),
});

export function serializePartyLibrary(parties: readonly Party[]): string {
  const sorted = [...parties].sort((a, b) => a.name.localeCompare(b.name));
  const file = { format: PARTY_LIBRARY_FORMAT, version: PARTY_LIBRARY_VERSION, parties: sorted };
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** Reads the party file. A broken party is skipped and reported, like broken monsters. */
export function parsePartyLibrary(text: string): { parties: Party[]; problems: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { parties: [], problems: [`Invalid JSON: ${(error as Error).message}`] };
  }
  const file = PartyLibraryFile.safeParse(raw);
  if (!file.success) return { parties: [], problems: ['Not a Lorewarden party file'] };
  const parties: Party[] = [];
  const problems: string[] = [];
  for (const [i, entry] of file.data.parties.entries()) {
    const parsed = Party.safeParse(entry);
    if (parsed.success) parties.push(parsed.data);
    else {
      const issue = parsed.error.issues[0];
      problems.push(`parties[${i}].${issue?.path.map(String).join('.')}: ${issue?.message}`);
    }
  }
  return { parties, problems };
}

/** Replaces the party with the same id, or adds it. */
export function upsertParty(parties: readonly Party[], party: Party): Party[] {
  const index = parties.findIndex((p) => p.id === party.id);
  if (index < 0) return [...parties, party];
  return parties.map((p, i) => (i === index ? party : p));
}
