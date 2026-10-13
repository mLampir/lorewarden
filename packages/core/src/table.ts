import { z } from 'zod';
import { createId } from './ids';
import { PLAYER_INITIATIVE_MAX, PLAYER_INITIATIVE_MIN } from './initiative';
import { stripLinks } from './links';
import { type Adventure, Id, Player, Reveal, type Session } from './model';
import type { Party } from './party';

// The table: the game master's app shows handouts, images and hints on the players' phones.
// The app sends a TableState to the table server on the game master's computer, and the server
// gives every player a PlayerView with only what that player may see.

/** Port of the Lorewarden server on the game master's computer. */
export const DEFAULT_SERVER_PORT = 47616;

/** Letters and digits that cannot be mistaken for one another when typed from a screen. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const JoinCode = z.string().regex(/^[A-HJ-NP-Z2-9]{6}$/);

/** Creates a code such as "K7QM2X" for the join link. Players without it cannot join. */
export function createJoinCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let code = '';
  for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return code;
}

/** A reveal with everything a phone needs to show it. */
export const TableReveal = z.object({
  id: Id,
  at: z.iso.datetime(),
  title: z.string(),
  text: z.string().optional(),
  /** The image as a data URL. */
  image: z.object({ mimeType: z.string().min(1), src: z.string().min(1) }).optional(),
  /** Marks a puzzle or a hint to a puzzle, so the phones can label it. */
  tag: z.enum(['puzzle', 'hint']).optional(),
  /** Set on a puzzle the party has solved. */
  solved: z.boolean().optional(),
  to: Reveal.shape.to,
});

/** What the game master app sends to the table server whenever something changes. */
export const TableState = z.object({
  code: JoinCode,
  /** The adventure's title, shown at the top of the players' screens. */
  title: z.string(),
  reveals: z.array(TableReveal),
  /**
   * Set while the phones ask for initiative. answers holds what each player has sent since `at`,
   * by player id, so every phone can show its own value.
   */
  initiative: z
    .object({ at: z.iso.datetime(), answers: z.record(Id, z.number().int()) })
    .optional(),
  /** The characters of the adventure's party, so players can pick theirs when they join. */
  characters: z.array(z.object({ id: Id.max(64), name: z.string().min(1) })).optional(),
});

/** What a phone sees before it joins: the table and which characters are still free. */
export const TableInfo = z.object({
  title: z.string(),
  characters: z.array(z.object({ id: Id, name: z.string(), taken: z.boolean() })),
});

/** What a phone sends when the player enters their initiative. */
export const PlayerInitiative = z.object({
  code: JoinCode,
  id: Player.shape.id,
  value: z.number().int().min(PLAYER_INITIATIVE_MIN).max(PLAYER_INITIATIVE_MAX),
});

/** Settings of the game master app that AI assistants follow when they write adventures. */
export const AiSettings = z.object({
  /** Language new adventures are written in. */
  language: z.string().min(2).max(35).optional(),
  /** Language of rules terms when it differs, e.g. "en" for English rules terms. */
  termsLanguage: z.string().min(2).max(35).optional(),
});

/** A reveal on a player's phone. Images are loaded from imageUrl. */
export const PlayerReveal = z.object({
  id: Id,
  at: z.iso.datetime(),
  title: z.string(),
  text: z.string().optional(),
  imageUrl: z.string().optional(),
  tag: TableReveal.shape.tag,
  solved: TableReveal.shape.solved,
  /** Shown to this player alone or to some players, not to the whole table. */
  personal: z.boolean(),
});

/** What the table server sends to a player's phone. */
export const PlayerView = z.object({
  title: z.string(),
  player: Player,
  /** Newest first. */
  reveals: z.array(PlayerReveal),
  /** Set while the game master asks for initiative; value is what this player has sent. */
  initiative: z.object({ at: z.iso.datetime(), value: z.number().int().optional() }).optional(),
  /** Set when the game master wants rules terms in English, e.g. "en". */
  termsLanguage: z.string().min(2).max(35).optional(),
});

export type TableReveal = z.infer<typeof TableReveal>;
export type TableState = z.infer<typeof TableState>;
export type AiSettings = z.infer<typeof AiSettings>;
export type PlayerReveal = z.infer<typeof PlayerReveal>;
export type PlayerView = z.infer<typeof PlayerView>;
export type PlayerInitiative = z.infer<typeof PlayerInitiative>;
export type TableInfo = z.infer<typeof TableInfo>;

/** Adds a player who has joined, or updates the name of one who rejoined. */
export function joinPlayer(session: Session, player: Player): Session {
  const known = session.players.find((p) => p.id === player.id);
  if (known?.name === player.name && known.characterId === player.characterId) return session;
  return {
    ...session,
    players: known
      ? session.players.map((p) => (p.id === player.id ? { ...player } : p))
      : [...session.players, { ...player }],
  };
}

/**
 * Removes a player. Reveals addressed only to them are removed as well; their character stays in
 * the initiative list without the link to their phone.
 */
export function forgetPlayer(session: Session, playerId: string): Session {
  const request = session.initiativeRequest;
  return {
    ...session,
    players: session.players.filter((p) => p.id !== playerId),
    initiative: session.initiative.map((combatant) => {
      if (combatant.playerId !== playerId) return combatant;
      const { playerId: _, ...rest } = combatant;
      return rest;
    }),
    ...(request
      ? {
          initiativeRequest: {
            ...request,
            answered: request.answered.filter((id) => id !== playerId),
          },
        }
      : {}),
    revealed: session.revealed.flatMap((reveal) => {
      if (reveal.to === 'all') return [reveal];
      const to = reveal.to.filter((id) => id !== playerId);
      return to.length > 0 ? [{ ...reveal, to }] : [];
    }),
  };
}

/** What to reveal: an image of the adventure, a text such as a hint, a puzzle or one of its hints. */
export type RevealContent =
  | { kind: 'asset'; assetId: string }
  | { kind: 'text'; title?: string; text: string }
  | { kind: 'puzzle'; puzzleId: string }
  | { kind: 'puzzleHint'; puzzleId: string; hintId: string };

export type NewReveal = RevealContent & { to: Reveal['to'] };

/** Shows a handout, image or hint to everyone or to some players. Blank texts are ignored. */
export function addReveal(session: Session, input: NewReveal, now: Date = new Date()): Session {
  if (Array.isArray(input.to) && input.to.length === 0) return session;
  const base = { id: createId('reveal'), at: now.toISOString(), to: input.to };
  let reveal: Reveal;
  if (input.kind === 'asset') {
    reveal = { ...base, kind: 'asset', assetId: input.assetId };
  } else if (input.kind === 'puzzle') {
    reveal = { ...base, kind: 'puzzle', puzzleId: input.puzzleId };
  } else if (input.kind === 'puzzleHint') {
    reveal = { ...base, kind: 'puzzleHint', puzzleId: input.puzzleId, hintId: input.hintId };
  } else {
    const text = input.text.trim();
    if (text === '') return session;
    const title = input.title?.trim();
    reveal = { ...base, kind: 'text', text, ...(title ? { title } : {}) };
  }
  return { ...session, revealed: [...session.revealed, reveal] };
}

/** Takes a reveal back from the players' phones. */
export function hideReveal(session: Session, revealId: string): Session {
  return { ...session, revealed: session.revealed.filter((r) => r.id !== revealId) };
}

/** Whether a player may see a reveal. */
export function canSee(reveal: Pick<Reveal, 'to'>, playerId: string): boolean {
  return reveal.to === 'all' || reveal.to.includes(playerId);
}

/**
 * Builds what the table server needs from the adventure and the session. Reveals of images,
 * puzzles or hints the adventure no longer has are left out. Text reveals without a title get
 * defaultTitle. Puzzles and hints show what the adventure says now, so a fixed typo reaches the
 * phones.
 */
export function tableState(
  adventure: Adventure,
  session: Session,
  code: string,
  defaultTitle = '',
  /** The party the adventure is played with, whose characters the players pick from. */
  party?: Pick<Party, 'characters'>,
): TableState {
  const characters =
    party && party.characters.length > 0
      ? { characters: party.characters.map(({ id, name }) => ({ id, name })) }
      : {};
  const image = (assetId: string | undefined) => {
    const asset = adventure.assets.find((a) => a.id === assetId);
    return asset && { mimeType: asset.mimeType, src: asset.src };
  };
  const reveals = session.revealed.flatMap((reveal): TableReveal[] => {
    const common = { id: reveal.id, at: reveal.at, to: reveal.to };
    if (reveal.kind === 'text') {
      return [
        { ...common, title: reveal.title ?? defaultTitle, text: stripLinks(reveal.text ?? '') },
      ];
    }
    if (reveal.kind === 'puzzle' || reveal.kind === 'puzzleHint') {
      const puzzle = adventure.puzzles.find((p) => p.id === reveal.puzzleId);
      if (!puzzle) return [];
      if (reveal.kind === 'puzzleHint') {
        const hint = puzzle.hints.find((h) => h.id === reveal.hintId);
        return hint
          ? [{ ...common, title: puzzle.title, text: stripLinks(hint.text), tag: 'hint' }]
          : [];
      }
      const picture = image(puzzle.assetId);
      return [
        {
          ...common,
          title: puzzle.title,
          ...(puzzle.prompt ? { text: stripLinks(puzzle.prompt) } : {}),
          ...(picture ? { image: picture } : {}),
          tag: 'puzzle',
          solved: session.solvedPuzzleIds.includes(puzzle.id),
        },
      ];
    }
    const asset = adventure.assets.find((a) => a.id === reveal.assetId);
    if (!asset) return [];
    return [{ ...common, title: asset.title, image: { mimeType: asset.mimeType, src: asset.src } }];
  });
  const request = session.initiativeRequest;
  if (!request) return { code, title: adventure.title, reveals, ...characters };
  const answers: Record<string, number> = {};
  for (const combatant of session.initiative) {
    if (combatant.playerId && request.answered.includes(combatant.playerId)) {
      answers[combatant.playerId] = combatant.initiative;
    }
  }
  return {
    code,
    title: adventure.title,
    reveals,
    initiative: { at: request.at, answers },
    ...characters,
  };
}

/** What one player sees: the reveals meant for them, newest first. */
export function playerView(
  state: Pick<TableState, 'title' | 'reveals' | 'initiative'>,
  player: Player,
  imageUrl: (revealId: string) => string,
): PlayerView {
  const reveals = state.reveals
    .filter((reveal) => canSee(reveal, player.id))
    .map(
      (reveal): PlayerReveal => ({
        id: reveal.id,
        at: reveal.at,
        title: reveal.title,
        ...(reveal.text !== undefined ? { text: reveal.text } : {}),
        ...(reveal.image ? { imageUrl: imageUrl(reveal.id) } : {}),
        ...(reveal.tag ? { tag: reveal.tag } : {}),
        ...(reveal.solved ? { solved: true } : {}),
        personal: reveal.to !== 'all',
      }),
    )
    .sort((a, b) => b.at.localeCompare(a.at));
  const asked = state.initiative;
  if (!asked) return { title: state.title, player, reveals };
  const value = asked.answers[player.id];
  return {
    title: state.title,
    player,
    reveals,
    initiative: { at: asked.at, ...(value !== undefined ? { value } : {}) },
  };
}

/** Splits a data URL into its media type and bytes. Parameters such as a charset are skipped. */
export function decodeDataUrl(src: string): { mimeType: string; bytes: Uint8Array } | undefined {
  const match = /^data:([^;,]+)(?:;[^;,=]+=[^;,]*)*(;base64)?,(.*)$/s.exec(src);
  if (!match) return undefined;
  const [, mimeType = '', base64, data = ''] = match;
  try {
    const bytes = base64
      ? Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
      : new TextEncoder().encode(decodeURIComponent(data));
    return { mimeType, bytes };
  } catch {
    return undefined;
  }
}

/** Who may still pick which character, for the join screen of a phone. */
export function tableInfo(
  state: Pick<TableState, 'title' | 'characters'>,
  online: readonly Player[],
): TableInfo {
  const taken = new Set(online.flatMap((p) => (p.characterId ? [p.characterId] : [])));
  return {
    title: state.title,
    characters: (state.characters ?? []).map((c) => ({ ...c, taken: taken.has(c.id) })),
  };
}
