import {
  type Adventure,
  type BattleMap,
  type Clue,
  checkIntegrity,
  createClue,
  createId,
  createItem,
  createNpc,
  createPuzzle,
  createScene,
  type Encounter,
  findMonster,
  type Item,
  type Monster,
  type Npc,
  type PoolMonster,
  type Puzzle,
  type ReviewHint,
  removeClue,
  removeItem,
  removeNpc,
  removePuzzle,
  removeScene,
  reviewAdventure,
  type Scene,
  type SceneExit,
  setPuzzleAsset,
  withLibraryMonsters,
} from '@lorewarden/core';
import { AdventureError } from './store';

/** Fields that are left out keep their value; a new entry starts from the app's defaults. */
type Patch<T> = { [K in keyof T]?: T[K] | undefined };

export interface Upserted {
  adventure: Adventure;
  id: string;
}

function upsert<T extends { id: string }>(
  list: T[],
  id: string | undefined,
  kind: string,
  create: () => T,
  patch: Patch<T>,
): { list: T[]; id: string } {
  const defined = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
  if (id === undefined) {
    const entry = { ...create(), ...defined };
    return { list: [...list, entry], id: entry.id };
  }
  if (!list.some((entry) => entry.id === id)) {
    throw new AdventureError(`No ${kind} with id "${id}". Leave out the id to create a new one.`);
  }
  return { list: list.map((entry) => (entry.id === id ? { ...entry, ...defined } : entry)), id };
}

function required(value: string | undefined, field: string, kind: string): string {
  if (value === undefined || value.trim() === '') {
    throw new AdventureError(`A new ${kind} needs a ${field}.`);
  }
  return value;
}

/** Shows an NPC or item in exactly the given scenes. */
function placeIn(
  adventure: Adventure,
  key: 'npcIds' | 'itemIds' | 'encounterIds',
  id: string,
  sceneIds: string[],
): Adventure {
  for (const sceneId of sceneIds) {
    if (!adventure.scenes.some((scene) => scene.id === sceneId)) {
      throw new AdventureError(`No scene with id "${sceneId}".`);
    }
  }
  return {
    ...adventure,
    scenes: adventure.scenes.map((scene) => {
      const others = scene[key].filter((other) => other !== id);
      return { ...scene, [key]: sceneIds.includes(scene.id) ? [...others, id] : others };
    }),
  };
}

/** A new adventure without scenes; the first scene the AI adds becomes the start. */
export function emptyAdventure(fields: {
  title: string;
  summary?: string | undefined;
  partySize: number;
  partyLevel: number;
  characters?: string | undefined;
  language?: string | undefined;
  termsLanguage?: string | undefined;
}): Adventure {
  return {
    id: createId('adv'),
    title: fields.title,
    summary: fields.summary ?? '',
    ruleset: 'srd-5.2',
    language: fields.language,
    termsLanguage: fields.termsLanguage,
    party: { size: fields.partySize, level: fields.partyLevel, characters: fields.characters },
    scenes: [],
    monsterPool: [],
    npcs: [],
    items: [],
    assets: [],
    encounters: [],
    clues: [],
    puzzles: [],
    monsters: [],
  };
}

export interface AdventurePatch {
  title?: string | undefined;
  summary?: string | undefined;
  partySize?: number | undefined;
  partyLevel?: number | undefined;
  characters?: string | undefined;
  language?: string | undefined;
  termsLanguage?: string | undefined;
  startSceneId?: string | undefined;
}

export function updateAdventure(adventure: Adventure, patch: AdventurePatch): Adventure {
  return {
    ...adventure,
    title: patch.title ?? adventure.title,
    summary: patch.summary ?? adventure.summary,
    language: patch.language ?? adventure.language,
    termsLanguage: patch.termsLanguage ?? adventure.termsLanguage,
    startSceneId: patch.startSceneId ?? adventure.startSceneId,
    party: {
      size: patch.partySize ?? adventure.party.size,
      level: patch.partyLevel ?? adventure.party.level,
      characters: patch.characters ?? adventure.party.characters,
    },
  };
}

export interface ScenePatch {
  id?: string | undefined;
  title?: string | undefined;
  purpose?: string | undefined;
  features?: string[] | undefined;
  wayOut?: string | undefined;
  description?: string | undefined;
  notes?: string | undefined;
  exits?: SceneExit[] | undefined;
  npcIds?: string[] | undefined;
  itemIds?: string[] | undefined;
  encounterIds?: string[] | undefined;
  ending?: boolean | undefined;
  levelUp?: boolean | undefined;
  battleMap?: BattleMap | undefined;
  /** Makes this the scene the adventure starts in. */
  start?: boolean | undefined;
}

export function upsertScene(adventure: Adventure, { id, start, ...patch }: ScenePatch): Upserted {
  const result = upsert<Scene>(
    adventure.scenes,
    id,
    'scene',
    () => createScene(required(patch.title, 'title', 'scene')),
    patch,
  );
  const first = adventure.scenes.length === 0;
  return {
    id: result.id,
    adventure: {
      ...adventure,
      scenes: result.list,
      startSceneId: start || first ? result.id : adventure.startSceneId,
    },
  };
}

/** Adds an exit, or updates the exit with the same label between the same scenes. */
export function linkScenes(
  adventure: Adventure,
  link: { fromSceneId: string; toSceneId: string; label: string; condition?: string | undefined },
): Adventure {
  if (!adventure.scenes.some((scene) => scene.id === link.fromSceneId)) {
    throw new AdventureError(`No scene with id "${link.fromSceneId}".`);
  }
  const exit: SceneExit = { label: link.label, targetSceneId: link.toSceneId };
  if (link.condition) exit.condition = link.condition;
  return {
    ...adventure,
    scenes: adventure.scenes.map((scene) => {
      if (scene.id !== link.fromSceneId) return scene;
      const same = (e: SceneExit) => e.targetSceneId === link.toSceneId && e.label === link.label;
      return scene.exits.some(same)
        ? { ...scene, exits: scene.exits.map((e) => (same(e) ? exit : e)) }
        : { ...scene, exits: [...scene.exits, exit] };
    }),
  };
}

export type NpcPatch = Patch<Npc> & { sceneIds?: string[] | undefined };

export function upsertNpc(adventure: Adventure, { id, sceneIds, ...patch }: NpcPatch): Upserted {
  const result = upsert<Npc>(
    adventure.npcs,
    id,
    'NPC',
    () => createNpc(required(patch.name, 'name', 'NPC')),
    patch,
  );
  const next = { ...adventure, npcs: result.list };
  return {
    id: result.id,
    adventure: sceneIds ? placeIn(next, 'npcIds', result.id, sceneIds) : next,
  };
}

export type ItemPatch = Patch<Item> & { sceneIds?: string[] | undefined };

export function upsertItem(adventure: Adventure, { id, sceneIds, ...patch }: ItemPatch): Upserted {
  const result = upsert<Item>(
    adventure.items,
    id,
    'item',
    () => createItem(required(patch.name, 'name', 'item')),
    patch,
  );
  const next = { ...adventure, items: result.list };
  return {
    id: result.id,
    adventure: sceneIds ? placeIn(next, 'itemIds', result.id, sceneIds) : next,
  };
}

export function upsertClue(adventure: Adventure, { id, ...patch }: Patch<Clue>): Upserted {
  const result = upsert<Clue>(
    adventure.clues,
    id,
    'clue',
    () => createClue(required(patch.text, 'text', 'clue')),
    patch,
  );
  return { id: result.id, adventure: { ...adventure, clues: result.list } };
}

/** Largest drawing an AI may attach to a puzzle; real puzzle drawings are a few kilobytes. */
export const MAX_SVG_LENGTH = 200_000;

/**
 * Checks a drawing for a puzzle. The apps show images only as pictures, where scripts never run,
 * but a drawing has no business carrying them or loading anything from elsewhere.
 */
export function checkSvg(svg: string): string {
  const trimmed = svg.trim();
  if (!/^(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(trimmed) || !/<\/svg>$/i.test(trimmed)) {
    throw new AdventureError('svg must be a single <svg> element.');
  }
  if (trimmed.length > MAX_SVG_LENGTH) {
    throw new AdventureError(`svg is too large; keep it under ${MAX_SVG_LENGTH / 1000} kB.`);
  }
  if (
    /<script|<foreignObject|\son[a-z]+\s*=|javascript:|(?:href|src)\s*=\s*["']?\s*(?:https?:|\/\/)/i.test(
      trimmed,
    )
  ) {
    throw new AdventureError(
      'svg must not contain scripts, event handlers, foreignObject or links to other files.',
    );
  }
  return trimmed;
}

export type PuzzlePatch = Omit<Patch<Puzzle>, 'hints' | 'assetId'> & {
  /** Replaces the hints. A hint keeps its id when its position stays, so reveals stay valid. */
  hints?: string[] | undefined;
  /** A drawing of the puzzle as SVG markup, shown with the prompt. */
  svg?: string | undefined;
};

export function upsertPuzzle(
  adventure: Adventure,
  { id, hints, svg, ...patch }: PuzzlePatch,
): Upserted {
  if (patch.sceneId && !adventure.scenes.some((scene) => scene.id === patch.sceneId)) {
    throw new AdventureError(`No scene with id "${patch.sceneId}".`);
  }
  const drawing = svg === undefined ? undefined : checkSvg(svg);
  const old = adventure.puzzles.find((puzzle) => puzzle.id === id);
  const result = upsert<Puzzle>(
    adventure.puzzles,
    id,
    'puzzle',
    () => createPuzzle(required(patch.title, 'title', 'puzzle')),
    {
      ...patch,
      hints: hints?.map((text, i) => ({ id: old?.hints[i]?.id ?? createId('hint'), text })),
    },
  );
  const next = { ...adventure, puzzles: result.list };
  if (drawing === undefined) return { id: result.id, adventure: next };
  const title = result.list.find((puzzle) => puzzle.id === result.id)?.title ?? 'Puzzle';
  return {
    id: result.id,
    adventure: setPuzzleAsset(next, result.id, {
      kind: 'handout',
      title,
      mimeType: 'image/svg+xml',
      src: `data:image/svg+xml;base64,${Buffer.from(drawing).toString('base64')}`,
    }),
  };
}

/**
 * Saves a creature of the monster pool. A monster of the game master's library it is based on is
 * copied into the adventure, so the adventure file carries its stat block.
 */
export function upsertPoolMonster(
  adventure: Adventure,
  { id, ...patch }: Patch<PoolMonster>,
  library: readonly Monster[] = [],
): Upserted {
  const result = upsert<PoolMonster>(
    adventure.monsterPool,
    id,
    'pool monster',
    () => {
      // A stat block brings its name and challenge rating along.
      const base = findMonster(adventure, library, patch.baseMonsterRef);
      const name = required(patch.name ?? base?.name, 'name', 'pool monster');
      const cr = patch.cr ?? base?.cr;
      if (cr === undefined) throw new AdventureError('A new pool monster needs a cr.');
      return {
        id: createId('pool'),
        name,
        description: '',
        cr,
        count: { min: 1, max: 1 },
        overrides: {},
        tags: [],
      };
    },
    patch,
  );
  return {
    id: result.id,
    adventure: withLibraryMonsters({ ...adventure, monsterPool: result.list }, library),
  };
}

/** Adds the stat block of an invented monster to the adventure, or replaces the one with its id. */
export function upsertMonster(adventure: Adventure, monster: Monster): Upserted {
  const exists = adventure.monsters.some((m) => m.id === monster.id);
  const monsters = exists
    ? adventure.monsters.map((m) => (m.id === monster.id ? monster : m))
    : [...adventure.monsters, monster];
  return { id: monster.id, adventure: { ...adventure, monsters } };
}

/** Saves an encounter and, with a scene, shows it in that scene only. */
export function upsertEncounter(
  adventure: Adventure,
  { id, ...patch }: Patch<Encounter>,
): Upserted {
  const result = upsert<Encounter>(
    adventure.encounters,
    id,
    'encounter',
    () => {
      if (!patch.monsters) throw new AdventureError('A new encounter needs monsters.');
      return { id: createId('enc'), monsters: patch.monsters, objects: [], mechanics: [] };
    },
    patch,
  );
  const next = { ...adventure, encounters: result.list };
  const sceneId = patch.sceneId;
  return {
    id: result.id,
    adventure: sceneId ? placeIn(next, 'encounterIds', result.id, [sceneId]) : next,
  };
}

export const ENTRY_KINDS = [
  'scene',
  'npc',
  'item',
  'clue',
  'puzzle',
  'encounter',
  'poolMonster',
  'monster',
] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

/** Removes an entry together with every reference to it. */
export function removeEntry(adventure: Adventure, kind: EntryKind, id: string): Adventure {
  const lists: Record<EntryKind, { id: string }[]> = {
    scene: adventure.scenes,
    npc: adventure.npcs,
    item: adventure.items,
    clue: adventure.clues,
    puzzle: adventure.puzzles,
    encounter: adventure.encounters,
    poolMonster: adventure.monsterPool,
    monster: adventure.monsters,
  };
  if (!lists[kind].some((entry) => entry.id === id)) {
    throw new AdventureError(`No ${kind} with id "${id}".`);
  }
  switch (kind) {
    case 'scene':
      return removeScene(adventure, id);
    case 'npc':
      return removeNpc(adventure, id);
    case 'item':
      return removeItem(adventure, id);
    case 'clue':
      return removeClue(adventure, id);
    case 'puzzle':
      return removePuzzle(adventure, id);
    case 'encounter':
      return {
        ...adventure,
        encounters: adventure.encounters.filter((encounter) => encounter.id !== id),
        scenes: adventure.scenes.map((scene) => ({
          ...scene,
          encounterIds: scene.encounterIds.filter((other) => other !== id),
        })),
      };
    case 'poolMonster': {
      const users = adventure.encounters.filter((e) =>
        e.monsters.some((m) => m.poolMonsterId === id),
      );
      if (users.length > 0) {
        const ids = users.map((e) => `"${e.id}"`).join(', ');
        throw new AdventureError(`Encounters ${ids} still use this monster. Change them first.`);
      }
      const npcs = adventure.npcs.filter((npc) => npc.poolMonsterId === id);
      if (npcs.length > 0) {
        const ids = npcs.map((npc) => `"${npc.id}"`).join(', ');
        throw new AdventureError(`NPCs ${ids} fight as this monster. Change them first.`);
      }
      return { ...adventure, monsterPool: adventure.monsterPool.filter((m) => m.id !== id) };
    }
    case 'monster': {
      const users = adventure.monsterPool.filter((m) => m.baseMonsterRef === id);
      if (users.length > 0) {
        const ids = users.map((m) => `"${m.id}"`).join(', ');
        throw new AdventureError(
          `Pool monsters ${ids} still use this stat block. Change them first.`,
        );
      }
      return { ...adventure, monsters: adventure.monsters.filter((m) => m.id !== id) };
    }
  }
}

/** The adventure without image data, which can be megabytes and means nothing to the AI. */
export function withoutImageData(adventure: Adventure) {
  return {
    ...adventure,
    assets: adventure.assets.map(({ id, kind, title }) => ({ id, kind, title })),
  };
}

/** Integrity problems and review hints in plain English, one line each. */
export function checkAdventure(adventure: Adventure): string[] {
  const problems = checkIntegrity(adventure).map((p) => `Error at ${p.path}: ${p.message}`);
  return [...problems, ...reviewAdventure(adventure).map((hint) => describeHint(adventure, hint))];
}

function describeHint(adventure: Adventure, hint: ReviewHint): string {
  const name = (
    list: { id: string; title?: string; name?: string; text?: string }[],
    id: string,
  ) => {
    const entry = list.find((e) => e.id === id);
    return `"${entry?.title ?? entry?.name ?? entry?.text ?? id}" (${id})`;
  };
  const scene = (id: string) => `Scene ${name(adventure.scenes, id)}`;
  const encounter = (id: string) => `Encounter "${id}"`;
  switch (hint.kind) {
    case 'unreachableScene':
      return `${scene(hint.sceneId)} cannot be reached from the start scene.`;
    case 'deadEnd':
      return `${scene(hint.sceneId)} has no exits and is not marked as an ending.`;
    case 'emptyScene':
      return `${scene(hint.sceneId)} has no description.`;
    case 'noEnding':
      return 'No scene is marked as an ending.';
    case 'clueNowhere':
      return `Clue ${name(adventure.clues, hint.clueId)} cannot be found in any scene.`;
    case 'clueInOneScene':
      return `Clue ${name(adventure.clues, hint.clueId)} can only be found in one scene; add at least one more.`;
    case 'clueWithoutLeads':
      return `Clue ${name(adventure.clues, hint.clueId)} has no ways to find it; add two or three leads, each tied to a scene or an NPC.`;
    case 'puzzleWithoutSolution':
      return `Puzzle ${name(adventure.puzzles, hint.puzzleId)} has no solution.`;
    case 'puzzleWithoutHints':
      return `Puzzle ${name(adventure.puzzles, hint.puzzleId)} has no hints for a party that gets stuck.`;
    case 'unusedNpc':
      return `NPC ${name(adventure.npcs, hint.npcId)} does not appear in any scene.`;
    case 'unusedItem':
      return `Item ${name(adventure.items, hint.itemId)} does not appear in any scene.`;
    case 'brokenLink':
      return `The link "[${hint.text}](${hint.id})" points to an NPC or item that does not exist.`;
    case 'encounterTooHard':
      return `${encounter(hint.encounterId)} is worth ${hint.xp} XP, above the high budget of ${hint.budget} XP for this party.`;
    case 'encounterDifficulty':
      return `${encounter(hint.encounterId)} says "${hint.stated}" but its ${hint.xp} XP make it "${hint.actual}".`;
    case 'climaxWithoutMechanic':
      return `${encounter(hint.encounterId)} is a boss fight or climax without mechanics; consider one or two, e.g. phases, a countdown or a weak spot.`;
  }
}
