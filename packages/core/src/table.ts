import { z } from 'zod';
import { createId } from './ids';
import { type Adventure, Id, Player, Reveal, type Session } from './model';

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
  to: Reveal.shape.to,
});

/** What the game master app sends to the table server whenever something changes. */
export const TableState = z.object({
  code: JoinCode,
  /** The adventure's title, shown at the top of the players' screens. */
  title: z.string(),
  reveals: z.array(TableReveal),
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
  /** Shown to this player alone or to some players, not to the whole table. */
  personal: z.boolean(),
});

/** What the table server sends to a player's phone. */
export const PlayerView = z.object({
  title: z.string(),
  player: Player,
  /** Newest first. */
  reveals: z.array(PlayerReveal),
});

export type TableReveal = z.infer<typeof TableReveal>;
export type TableState = z.infer<typeof TableState>;
export type AiSettings = z.infer<typeof AiSettings>;
export type PlayerReveal = z.infer<typeof PlayerReveal>;
export type PlayerView = z.infer<typeof PlayerView>;

/** Adds a player who has joined, or updates the name of one who rejoined. */
export function joinPlayer(session: Session, player: Player): Session {
  const known = session.players.find((p) => p.id === player.id);
  if (known?.name === player.name) return session;
  return {
    ...session,
    players: known
      ? session.players.map((p) => (p.id === player.id ? { ...player } : p))
      : [...session.players, { ...player }],
  };
}

/** Removes a player. Reveals addressed only to them are removed as well. */
export function forgetPlayer(session: Session, playerId: string): Session {
  return {
    ...session,
    players: session.players.filter((p) => p.id !== playerId),
    revealed: session.revealed.flatMap((reveal) => {
      if (reveal.to === 'all') return [reveal];
      const to = reveal.to.filter((id) => id !== playerId);
      return to.length > 0 ? [{ ...reveal, to }] : [];
    }),
  };
}

/** What to reveal: an image of the adventure, or a text such as a hint. */
export type RevealContent =
  | { kind: 'asset'; assetId: string }
  | { kind: 'text'; title?: string; text: string };

export type NewReveal = RevealContent & { to: Reveal['to'] };

/** Shows a handout, image or hint to everyone or to some players. Blank texts are ignored. */
export function addReveal(session: Session, input: NewReveal, now: Date = new Date()): Session {
  if (Array.isArray(input.to) && input.to.length === 0) return session;
  const base = { id: createId('reveal'), at: now.toISOString(), to: input.to };
  let reveal: Reveal;
  if (input.kind === 'asset') {
    reveal = { ...base, kind: 'asset', assetId: input.assetId };
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
 * Builds what the table server needs from the adventure and the session. Reveals of images the
 * adventure no longer has are left out. Text reveals without a title get defaultTitle.
 */
export function tableState(
  adventure: Adventure,
  session: Session,
  code: string,
  defaultTitle = '',
): TableState {
  const reveals = session.revealed.flatMap((reveal): TableReveal[] => {
    const common = { id: reveal.id, at: reveal.at, to: reveal.to };
    if (reveal.kind === 'text') {
      return [{ ...common, title: reveal.title ?? defaultTitle, text: reveal.text ?? '' }];
    }
    const asset = adventure.assets.find((a) => a.id === reveal.assetId);
    if (!asset) return [];
    return [{ ...common, title: asset.title, image: { mimeType: asset.mimeType, src: asset.src } }];
  });
  return { code, title: adventure.title, reveals };
}

/** What one player sees: the reveals meant for them, newest first. */
export function playerView(
  state: Pick<TableState, 'title' | 'reveals'>,
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
        personal: reveal.to !== 'all',
      }),
    )
    .sort((a, b) => b.at.localeCompare(a.at));
  return { title: state.title, player, reveals };
}

/** Splits a data URL into its media type and bytes. */
export function decodeDataUrl(src: string): { mimeType: string; bytes: Uint8Array } | undefined {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(src);
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
