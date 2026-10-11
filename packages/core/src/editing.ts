import { createId } from './ids';
import type { Adventure, Asset, Clue, Item, Npc, Scene } from './model';

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
    monsters: [],
  };
}

export function createScene(title: string): Scene {
  return {
    id: createId('scene'),
    title,
    description: '',
    notes: '',
    npcIds: [],
    itemIds: [],
    assetIds: [],
    exits: [],
    encounterIds: [],
    ending: false,
  };
}

export function createNpc(name: string): Npc {
  return { id: createId('npc'), name, description: '', voice: '', notes: '', tags: [] };
}

export function createItem(name: string): Item {
  return { id: createId('item'), name, description: '', notes: '' };
}

export function createClue(text: string): Clue {
  return { id: createId('clue'), text, notes: '', sceneIds: [] };
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

/** Removes an image and its appearances in scenes. */
export function removeAsset(adventure: Adventure, assetId: string): Adventure {
  return {
    ...adventure,
    assets: adventure.assets.filter((asset) => asset.id !== assetId),
    scenes: adventure.scenes.map((scene) => ({
      ...scene,
      assetIds: scene.assetIds.filter((id) => id !== assetId),
    })),
  };
}

/**
 * Removes a scene together with every exit, encounter link, clue location and start reference
 * pointing to it, and the images no other scene shows.
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
    })),
    assets: adventure.assets.filter(
      (asset) =>
        scenes.some((scene) => scene.assetIds.includes(asset.id)) ||
        !adventure.scenes.some((scene) => scene.assetIds.includes(asset.id)),
    ),
  };
}

/** Removes an NPC and its appearances in scenes. */
export function removeNpc(adventure: Adventure, npcId: string): Adventure {
  return {
    ...adventure,
    npcs: adventure.npcs.filter((npc) => npc.id !== npcId),
    scenes: adventure.scenes.map((scene) => ({
      ...scene,
      npcIds: scene.npcIds.filter((id) => id !== npcId),
    })),
  };
}

/** Removes an item and its appearances in scenes. */
export function removeItem(adventure: Adventure, itemId: string): Adventure {
  return {
    ...adventure,
    items: adventure.items.filter((item) => item.id !== itemId),
    scenes: adventure.scenes.map((scene) => ({
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
