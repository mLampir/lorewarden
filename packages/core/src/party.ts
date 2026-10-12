import { z } from 'zod';
import { createId } from './ids';
import { createCombatant } from './initiative';
import { type Adventure, type Combatant, Id } from './model';

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
});

export const Party = z.object({
  id: Id,
  name: z.string().trim().min(1).max(60),
  characters: z.array(PlayerCharacter).default([]),
});

export type PlayerCharacter = z.infer<typeof PlayerCharacter>;
export type Party = z.infer<typeof Party>;

export function createParty(name: string): Party {
  return { id: createId('party'), name, characters: [] };
}

export function createCharacter(name: string, level = 1): PlayerCharacter {
  return { id: createId('pc'), name, className: '', level, notes: '' };
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
      return `- ${c.name}${c.player ? ` (${c.player})` : ''}: ${stats.join(', ')}${notes ? `. ${notes}` : ''}`;
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
