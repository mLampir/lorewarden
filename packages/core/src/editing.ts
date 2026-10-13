import { createId } from './ids';
import { mapLinkableTexts, unlink } from './links';
import type { Adventure, Asset, Clue, Item, Npc, Puzzle, PuzzleHint, Scene } from './model';

export interface NewAdventure {
  title: string;
  partySize: number;
  partyLevel: number;
  /** Language tag of the adventure text, e.g. "de". */
  language?: string;
  /** Language tag of rules terms, if they differ from the adventure text. */
  termsLanguage?: string;
}

/** Creates an adventure with one empty start scene. */
export function createAdventure({
  title,
  partySize,
  partyLevel,
  language,
  termsLanguage,
}: NewAdventure): Adventure {
  const scene = createScene(title);
  return {
    id: createId('adv'),
    title,
    summary: '',
    ruleset: 'srd-5.2',
    language,
    termsLanguage,
    party: { size: partySize, level: partyLevel },
    startSceneId: scene.id,
    scenes: [scene],
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

export function createScene(title: string): Scene {
  return {
    id: createId('scene'),
    title,
    purpose: '',
    features: [],
    wayOut: '',
    description: '',
    notes: '',
    npcIds: [],
    itemIds: [],
    assetIds: [],
    exits: [],
    encounterIds: [],
    ending: false,
    levelUp: false,
  };
}

export function createNpc(name: string): Npc {
  return { id: createId('npc'), name, description: '', voice: '', notes: '', tags: [] };
}

export function createItem(name: string): Item {
  return { id: createId('item'), name, description: '', notes: '' };
}

export function createClue(text: string): Clue {
  return { id: createId('clue'), text, notes: '', sceneIds: [], leads: [] };
}

export function createPuzzle(title: string, sceneId?: string): Puzzle {
  return {
    id: createId('puzzle'),
    title,
    sceneId,
    prompt: '',
    solution: '',
    hints: [],
    notes: '',
  };
}

export function createPuzzleHint(text: string): PuzzleHint {
  return { id: createId('hint'), text };
}

/** Whether a scene or a puzzle still shows an image. */
function assetInUse(adventure: Adventure, assetId: string): boolean {
  return (
    adventure.scenes.some((scene) => scene.assetIds.includes(assetId)) ||
    adventure.puzzles.some((puzzle) => puzzle.assetId === assetId)
  );
}

/** Gives a puzzle an image, or replaces its image. The old one goes if nothing else shows it. */
export function setPuzzleAsset(
  adventure: Adventure,
  puzzleId: string,
  asset: Omit<Asset, 'id'>,
): Adventure {
  const id = createId('asset');
  const old = adventure.puzzles.find((puzzle) => puzzle.id === puzzleId)?.assetId;
  const next: Adventure = {
    ...adventure,
    assets: [...adventure.assets, { ...asset, id }],
    puzzles: adventure.puzzles.map((puzzle) =>
      puzzle.id === puzzleId ? { ...puzzle, assetId: id } : puzzle,
    ),
  };
  return old && !assetInUse(next, old) ? removeAsset(next, old) : next;
}

/** Removes a puzzle and its image, unless a scene or another puzzle shows that image too. */
export function removePuzzle(adventure: Adventure, puzzleId: string): Adventure {
  const assetId = adventure.puzzles.find((puzzle) => puzzle.id === puzzleId)?.assetId;
  const next = { ...adventure, puzzles: adventure.puzzles.filter((p) => p.id !== puzzleId) };
  return assetId && !assetInUse(next, assetId) ? removeAsset(next, assetId) : next;
}

/** Adds an image to the adventure and shows it in a scene. */
export function addSceneAsset(
  adventure: Adventure,
  sceneId: string,
  asset: Omit<Asset, 'id'>,
): Adventure {
  const id = createId('asset');
  return {
    ...adventure,
    assets: [...adventure.assets, { ...asset, id }],
    scenes: adventure.scenes.map((scene) =>
      scene.id === sceneId ? { ...scene, assetIds: [...scene.assetIds, id] } : scene,
    ),
  };
}

/** Removes an image and its appearances in scenes and puzzles. */
export function removeAsset(adventure: Adventure, assetId: string): Adventure {
  return {
    ...adventure,
    assets: adventure.assets.filter((asset) => asset.id !== assetId),
    scenes: adventure.scenes.map((scene) => ({
      ...scene,
      assetIds: scene.assetIds.filter((id) => id !== assetId),
    })),
    puzzles: adventure.puzzles.map((puzzle) =>
      puzzle.assetId === assetId ? { ...puzzle, assetId: undefined } : puzzle,
    ),
  };
}

/**
 * Removes a scene together with every exit, encounter link, clue location, puzzle location and
 * start reference pointing to it, and the images no other scene shows.
 */
export function removeScene(adventure: Adventure, sceneId: string): Adventure {
  const scenes = adventure.scenes
    .filter((scene) => scene.id !== sceneId)
    .map((scene) => ({
      ...scene,
      exits: scene.exits.filter((exit) => exit.targetSceneId !== sceneId),
    }));
  return {
    ...adventure,
    scenes,
    startSceneId: adventure.startSceneId === sceneId ? scenes[0]?.id : adventure.startSceneId,
    encounters: adventure.encounters.map((encounter) =>
      encounter.sceneId === sceneId ? { ...encounter, sceneId: undefined } : encounter,
    ),
    clues: adventure.clues.map((clue) => ({
      ...clue,
      sceneIds: clue.sceneIds.filter((id) => id !== sceneId),
      leads: clue.leads.map((lead) =>
        lead.sceneId === sceneId ? { ...lead, sceneId: undefined } : lead,
      ),
    })),
    puzzles: adventure.puzzles.map((puzzle) =>
      puzzle.sceneId === sceneId ? { ...puzzle, sceneId: undefined } : puzzle,
    ),
    assets: adventure.assets.filter(
      (asset) =>
        scenes.some((scene) => scene.assetIds.includes(asset.id)) ||
        adventure.puzzles.some((puzzle) => puzzle.assetId === asset.id) ||
        !adventure.scenes.some((scene) => scene.assetIds.includes(asset.id)),
    ),
  };
}

/**
 * Removes an NPC, its appearances in scenes and its ties to clue leads. Links to it in the texts
 * become plain words.
 */
export function removeNpc(adventure: Adventure, npcId: string): Adventure {
  const unlinked = mapLinkableTexts(adventure, (text) => unlink(text, npcId));
  return {
    ...unlinked,
    npcs: unlinked.npcs.filter((npc) => npc.id !== npcId),
    scenes: unlinked.scenes.map((scene) => ({
      ...scene,
      npcIds: scene.npcIds.filter((id) => id !== npcId),
    })),
    clues: unlinked.clues.map((clue) => ({
      ...clue,
      leads: clue.leads.map((lead) =>
        lead.npcId === npcId ? { ...lead, npcId: undefined } : lead,
      ),
    })),
  };
}

/** Removes an item and its appearances in scenes. Links to it in the texts become plain words. */
export function removeItem(adventure: Adventure, itemId: string): Adventure {
  const unlinked = mapLinkableTexts(adventure, (text) => unlink(text, itemId));
  return {
    ...unlinked,
    items: unlinked.items.filter((item) => item.id !== itemId),
    scenes: unlinked.scenes.map((scene) => ({
      ...scene,
      itemIds: scene.itemIds.filter((id) => id !== itemId),
    })),
  };
}

export function removeClue(adventure: Adventure, clueId: string): Adventure {
  return { ...adventure, clues: adventure.clues.filter((clue) => clue.id !== clueId) };
}

/**
 * Copies an adventure under a new id, so it can sit next to the original. With a party the copy
 * is meant for another group; its encounters and rewards still have to be adapted.
 */
export function copyAdventure(
  adventure: Adventure,
  title: string,
  party: Adventure['party'] = adventure.party,
): Adventure {
  return {
    ...(JSON.parse(JSON.stringify(adventure)) as Adventure),
    id: createId('adv'),
    title,
    party: { ...party },
  };
}
