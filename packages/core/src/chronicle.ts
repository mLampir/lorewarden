import { z } from 'zod';
import { stripLinks } from './links';
import { type Adventure, Id, type LogEntry, type Session } from './model';
import type { Party } from './party';

// The party chronicle: the adventures a group has played, with their sessions and a short note on
// what happened, so the next adventure can build on them and the AI need not ask.

/** What the game master keeps from an adventure a party played. */
export const ChronicleEntry = z.object({
  adventureId: Id,
  /** The adventure's title when the note was written, so the note outlives the adventure. */
  title: z.string().trim().min(1).max(200),
  /**
   * A few bullet points: how it ended, NPCs who survive or hold a grudge, loose ends, rewards
   * that matter later.
   */
  whatHappened: z.string().max(4000).default(''),
});

export type ChronicleEntry = z.infer<typeof ChronicleEntry>;

/** One session of a party's history, as the party page and AI assistants see it. */
export interface HistorySession {
  id: string;
  startedAt: string;
  /** The scene the party was in when the session was saved last, and whether it ends the adventure. */
  lastScene?: { title: string; ending: boolean };
  /** The clues the party found, each the truth it learned, without links. */
  foundClues: string[];
  /** Titles of the puzzles the party solved. */
  solvedPuzzles: string[];
  log: LogEntry[];
}

/** An adventure a party played, with its sessions newest first. */
export interface HistoryAdventure {
  adventureId: string;
  title: string;
  /** False when the adventure was deleted and only the note on what happened is left. */
  exists: boolean;
  /** The adventure's summary for the game master: hook, antagonist, truth, possible endings. */
  summary?: string;
  whatHappened: string;
  sessions: HistorySession[];
}

/** A party's history: the adventures it played, the one played last first. */
export interface PartyHistory {
  partyId: string;
  partyName: string;
  adventures: HistoryAdventure[];
}

/**
 * Puts together what a party played: its sessions grouped by adventure, and the notes on what
 * happened, also for adventures that were deleted since. Adventures without sessions or notes are
 * left out. `adventures` holds the adventures the sessions belong to, as far as they still exist.
 */
export function partyHistory(
  party: Party,
  sessions: readonly Session[],
  adventures: readonly Adventure[],
): PartyHistory {
  const byAdventure = new Map<string, Session[]>();
  for (const session of sessions) {
    if (session.partyId !== party.id) continue;
    const list = byAdventure.get(session.adventureId) ?? [];
    list.push(session);
    byAdventure.set(session.adventureId, list);
  }
  const ids = new Set([...byAdventure.keys(), ...party.chronicle.map((e) => e.adventureId)]);
  const entries: (HistoryAdventure & { order: string })[] = [];
  for (const adventureId of ids) {
    const adventure = adventures.find((a) => a.id === adventureId);
    const entry = party.chronicle.find((e) => e.adventureId === adventureId);
    const played = (byAdventure.get(adventureId) ?? [])
      .slice()
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    entries.push({
      adventureId,
      title: adventure?.title ?? entry?.title ?? adventureId,
      exists: adventure !== undefined,
      ...(adventure?.summary.trim() ? { summary: adventure.summary.trim() } : {}),
      whatHappened: entry?.whatHappened ?? '',
      sessions: played.map((session) => historySession(session, adventure)),
      // Notes without sessions keep their place in the chronicle, behind those still played.
      order: played[0]?.startedAt ?? '',
    });
  }
  const notes = party.chronicle.map((e) => e.adventureId);
  entries.sort(
    (a, b) =>
      b.order.localeCompare(a.order) || notes.indexOf(a.adventureId) - notes.indexOf(b.adventureId),
  );
  return {
    partyId: party.id,
    partyName: party.name,
    adventures: entries.map(({ order: _, ...rest }) => rest),
  };
}

function historySession(session: Session, adventure: Adventure | undefined): HistorySession {
  const scene = adventure?.scenes.find((s) => s.id === session.currentSceneId);
  const pick = <T extends { id: string }>(list: readonly T[] | undefined, ids: string[]) =>
    ids.flatMap((id) => list?.find((entry) => entry.id === id) ?? []);
  return {
    id: session.id,
    startedAt: session.startedAt,
    ...(scene ? { lastScene: { title: scene.title, ending: scene.ending === true } } : {}),
    foundClues: pick(adventure?.clues, session.foundClueIds).map((clue) => stripLinks(clue.text)),
    solvedPuzzles: pick(adventure?.puzzles, session.solvedPuzzleIds).map((p) => p.title),
    log: session.log,
  };
}

/**
 * Sets what happened in an adventure the party played. A new note goes first, as the adventure
 * played last is usually the one written about. A blank note on an adventure that no longer
 * exists drops the entry, so nothing is left of it.
 */
export function setWhatHappened(
  party: Party,
  adventure: { adventureId: string; title: string; exists?: boolean },
  text: string,
): Party {
  const rest = party.chronicle.filter((e) => e.adventureId !== adventure.adventureId);
  if (text.trim() === '' && adventure.exists === false) return { ...party, chronicle: rest };
  const known = party.chronicle.find((e) => e.adventureId === adventure.adventureId);
  const entry: ChronicleEntry = {
    adventureId: adventure.adventureId,
    title: adventure.title.trim().slice(0, 200) || adventure.adventureId,
    whatHappened: text,
  };
  return {
    ...party,
    chronicle: known
      ? party.chronicle.map((e) => (e === known ? entry : e))
      : [entry, ...party.chronicle],
  };
}

/**
 * Brings notes another program changed, such as an AI assistant, into the copy of a party the
 * game master is editing. `base` is the stored party the copy was last brought up to date with:
 * only notes that changed since then are taken, so the game master's own edits stay. Returns
 * local itself when nothing changes.
 */
export function takeChronicleNotes(local: Party, stored: Party, base: Party | undefined): Party {
  const before = new Map(base?.chronicle.map((e) => [e.adventureId, e.whatHappened]));
  let chronicle = local.chronicle;
  for (const entry of stored.chronicle) {
    if (before.get(entry.adventureId) === entry.whatHappened) continue;
    const mine = chronicle.find((e) => e.adventureId === entry.adventureId);
    if (mine?.whatHappened === entry.whatHappened) continue;
    chronicle = mine ? chronicle.map((e) => (e === mine ? entry : e)) : [entry, ...chronicle];
  }
  return chronicle === local.chronicle ? local : { ...local, chronicle };
}

/**
 * The notes on what happened in earlier adventures, for AI instructions, or an empty string when
 * there are none. Each adventure is a heading line followed by its bullets, indented.
 */
export function describeChronicle(party: Party): string {
  return party.chronicle
    .filter((entry) => entry.whatHappened.trim() !== '')
    .map((entry) => {
      const lines = entry.whatHappened
        .trim()
        .split(/\r?\n/)
        .filter((line) => line.trim() !== '')
        .map((line) => `  ${/^\s*[-*•]\s/.test(line) ? line.trim() : `- ${line.trim()}`}`);
      return `- "${entry.title}":\n${lines.join('\n')}`;
    })
    .join('\n');
}

/**
 * The section on earlier adventures for the prompts that write or adapt an adventure, or an empty
 * string when the party has no notes yet. `ask` is what the prompt would otherwise ask about them.
 */
export function chronicleSection(party: Party | undefined, ask = ''): string {
  const chronicle = party ? describeChronicle(party) : '';
  if (chronicle === '') return '';
  return `
## What the group played before

My group has played these adventures together, the latest first:

${chronicle}

${ask}Build on it where it fits: bring back an NPC who survived or holds a grudge, a place they know, a loose end or a reward that matters now. Do not retell the earlier adventures, and keep the adventure playable for someone who missed them.
`;
}

/**
 * Builds instructions for an AI assistant to suggest the note on what happened in an adventure,
 * from the logs of its sessions. The game master pastes the answer into the note and edits it.
 */
export function buildWhatHappenedPrompt(adventure: HistoryAdventure): string {
  const summary = adventure.summary ?? '';
  const sessions = [...adventure.sessions].reverse().map((session, index) => {
    const lines = session.log.map(
      (entry) => `- ${entry.kind === 'scene' ? `Moved to the scene "${entry.text}"` : entry.text}`,
    );
    const facts = [
      session.lastScene
        ? `Last scene: "${session.lastScene.title}"${session.lastScene.ending ? ' (an ending)' : ''}`
        : '',
      session.foundClues.length > 0 ? `Clues found: ${session.foundClues.join('; ')}` : '',
      session.solvedPuzzles.length > 0 ? `Puzzles solved: ${session.solvedPuzzles.join('; ')}` : '',
    ].filter(Boolean);
    return `### Session ${index + 1}, ${session.startedAt.slice(0, 10)}

${[...facts, '', 'Log:', ...(lines.length > 0 ? lines : ['- (empty)'])].join('\n')}`;
  });
  return `You help me, a game master of a 5e-compatible tabletop RPG, keep a chronicle of the adventures my group plays, so the next adventure can build on them.

Below is my log of the adventure "${adventure.title}". Write what happened as five to eight short bullet points, one line each, starting with "- " and with the key word in **bold**:

- how it ended and what the party chose
- NPCs who survived, owe the party something or hold a grudge
- loose ends, open questions and threats still out there
- rewards and items that may matter later

Write only what the log says or clearly implies; leave out what is uncertain. No headings, no introduction, just the bullet points, in the language the log is written in.
${summary ? `\n## What the adventure was about\n\n${summary}\n` : ''}
## The log

${sessions.length > 0 ? sessions.join('\n\n') : 'No sessions recorded.'}
`;
}
