import { type FileFormat, upgradeFile } from './file-format';
import { createId } from './ids';
import { outOfCombat } from './initiative';
import { toggleId } from './library';
import { type Adventure, type LogEntry, type Scene, Session } from './model';

/** Session files: what happened while an adventure was played, kept next to the adventures. */
export const SESSION_FILE: FileFormat = {
  format: 'lorewarden.session',
  version: 1,
  migrations: {},
  wrongFormat: 'Not a Lorewarden session file',
};

export function serializeSession(session: Session): string {
  const file = { format: SESSION_FILE.format, version: SESSION_FILE.version, session };
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** Reads a session file, or returns undefined when it is not a valid one. */
export function parseSessionFile(json: string): Session | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return undefined;
  }
  const upgraded = upgradeFile(raw, SESSION_FILE);
  if (!upgraded.ok) return undefined;
  const parsed = Session.safeParse(upgraded.file.session);
  return parsed.success ? parsed.data : undefined;
}

/**
 * Starts a session at the adventure's start scene.
 * Player characters from the previous session are carried over so they need not be typed again,
 * and so are the joined players and what they were shown: handouts stay with the party.
 */
export function startSession(
  adventure: Adventure,
  previous?: Session,
  now: Date = new Date(),
): Session {
  const start = adventure.scenes.find((scene) => scene.id === adventure.startSceneId);
  const session: Session = {
    id: createId('session'),
    adventureId: adventure.id,
    startedAt: now.toISOString(),
    log: [],
    initiative: (previous?.initiative ?? [])
      .filter((combatant) => combatant.kind === 'pc')
      .map(outOfCombat),
    players: previous?.players ?? [],
    revealed: previous?.revealed ?? [],
    foundClueIds: [],
    solvedPuzzleIds: [],
    firedMechanicIds: [],
    tableRolls: {},
  };
  return start ? moveToScene(session, start, now) : session;
}

/** Moves the party to a scene and records the move in the log. */
export function moveToScene(session: Session, scene: Scene, now: Date = new Date()): Session {
  if (session.currentSceneId === scene.id) return session;
  const entry: LogEntry = {
    id: createId('log'),
    at: now.toISOString(),
    kind: 'scene',
    text: scene.title,
    sceneId: scene.id,
  };
  return { ...session, currentSceneId: scene.id, log: [...session.log, entry] };
}

/** Adds a note to the log, tagged with the current scene. Blank notes are ignored. */
export function addLogNote(session: Session, text: string, now: Date = new Date()): Session {
  const trimmed = text.trim();
  if (trimmed === '') return session;
  const entry: LogEntry = {
    id: createId('log'),
    at: now.toISOString(),
    kind: 'note',
    text: trimmed,
    sceneId: session.currentSceneId,
  };
  return { ...session, log: [...session.log, entry] };
}

/** Changes the text of a note. A blank text removes the entry. */
export function editLogEntry(session: Session, entryId: string, text: string): Session {
  const trimmed = text.trim();
  if (trimmed === '') return removeLogEntry(session, entryId);
  return {
    ...session,
    log: session.log.map((entry) => (entry.id === entryId ? { ...entry, text: trimmed } : entry)),
  };
}

export function removeLogEntry(session: Session, entryId: string): Session {
  return { ...session, log: session.log.filter((entry) => entry.id !== entryId) };
}

/** Marks a clue as found, or as not found again if it already was. */
export function toggleClueFound(session: Session, clueId: string): Session {
  return { ...session, foundClueIds: toggleId(session.foundClueIds, clueId) };
}

/** Marks a puzzle as solved, or as unsolved again if it already was. */
export function togglePuzzleSolved(session: Session, puzzleId: string): Session {
  return { ...session, solvedPuzzleIds: toggleId(session.solvedPuzzleIds, puzzleId) };
}
