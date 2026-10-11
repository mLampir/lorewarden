import { createId } from './ids';
import type { Adventure, LogEntry, Scene, Session } from './model';

/**
 * Starts a session at the adventure's start scene.
 * Player characters from the previous session are carried over so they need not be typed again.
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
      .map((combatant) => ({ ...combatant, conditions: [] })),
    revealed: [],
    foundClueIds: [],
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
  const found = session.foundClueIds.includes(clueId);
  return {
    ...session,
    foundClueIds: found
      ? session.foundClueIds.filter((id) => id !== clueId)
      : [...session.foundClueIds, clueId],
  };
}
