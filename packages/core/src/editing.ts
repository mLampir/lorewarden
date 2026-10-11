import { createId } from './ids';
import type { Adventure, Item, Npc, Scene } from './model';

export interface NewAdventure {
  title: string;
  partySize: number;
  partyLevel: number;
}

/** Creates an adventure with one empty start scene. */
export function createAdventure({ title, partySize, partyLevel }: NewAdventure): Adventure {
  const scene = createScene(title);
  return {
    id: createId('adv'),
    title,
    ruleset: 'srd-5.2',
    party: { size: partySize, level: partyLevel },
    startSceneId: scene.id,
    scenes: [scene],
    monsterPool: [],
    npcs: [],
    items: [],
    assets: [],
    encounters: [],
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
  };
}

export function createNpc(name: string): Npc {
  return { id: createId('npc'), name, description: '', voice: '', notes: '', tags: [] };
}

export function createItem(name: string): Item {
  return { id: createId('item'), name, description: '', notes: '' };
}

/** Removes a scene together with every exit, encounter link and start reference pointing to it. */
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

/** Copies an adventure under a new id, so it can sit next to the original. */
export function copyAdventure(adventure: Adventure, title: string): Adventure {
  return { ...(JSON.parse(JSON.stringify(adventure)) as Adventure), id: createId('adv'), title };
}
