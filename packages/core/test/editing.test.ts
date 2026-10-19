import { describe, expect, it } from 'vitest';
import {
  addSceneAsset,
  brokenLinks,
  checkIntegrity,
  copyAdventure,
  createAdventure,
  createClue,
  createId,
  removeAsset,
  removeClue,
  removeItem,
  removeNpc,
  removeScene,
} from '../src';
import { loadExample, nth } from './helpers';

describe('createId', () => {
  it('uses the prefix and differs between calls', () => {
    const a = createId('scene');
    expect(a).toMatch(/^scene-[0-9a-z]{10}$/);
    expect(createId('scene')).not.toBe(a);
  });
});

describe('createAdventure', () => {
  it('starts with one scene that is the start scene', () => {
    const adventure = createAdventure({ title: 'Test', partySize: 4, partyLevel: 3 });
    expect(adventure.scenes).toHaveLength(1);
    expect(adventure.startSceneId).toBe(adventure.scenes[0]?.id);
    expect(adventure.party).toEqual({ size: 4, level: 3 });
    expect(checkIntegrity(adventure)).toEqual([]);
  });
});

describe('removing entities', () => {
  it('removes a scene and every reference to it', () => {
    const result = removeScene(loadExample(), 'scene-causeway');
    expect(result.scenes.map((s) => s.id)).not.toContain('scene-causeway');
    expect(result.encounters[0]?.sceneId).toBeUndefined();
    expect(checkIntegrity(result)).toEqual([]);
  });

  it('removes a scene from the places where clues can be found', () => {
    const result = removeScene(loadExample(), 'scene-ferryhouse');
    expect(result.clues.find((c) => c.id === 'clue-iselde')?.sceneIds).toEqual(['scene-ferry']);
    expect(checkIntegrity(result)).toEqual([]);
  });

  it('moves the start to the first remaining scene when the start scene is removed', () => {
    const result = removeScene(loadExample(), 'scene-ferry');
    expect(result.startSceneId).toBe('scene-ferryhouse');
    expect(checkIntegrity(result)).toEqual([]);
  });

  it('removes an NPC from the scenes it appears in', () => {
    const result = removeNpc(loadExample(), 'npc-brannoc');
    expect(result.npcs.map((n) => n.id)).toEqual(['npc-iselde']);
    expect(result.scenes[0]?.npcIds).toEqual([]);
    expect(checkIntegrity(result)).toEqual([]);
  });

  it('turns links to a removed NPC or item into plain words', () => {
    const withoutNpc = removeNpc(loadExample(), 'npc-brannoc');
    expect(brokenLinks(withoutNpc)).toEqual([]);
    expect(nth(withoutNpc.scenes, 0).notes).toContain('- **Brannoc** refuses');
    expect(JSON.stringify(withoutNpc)).toContain('(npc-iselde)');
    const withoutItem = removeItem(loadExample(), 'item-logbook');
    expect(brokenLinks(withoutItem)).toEqual([]);
    expect(JSON.stringify(withoutItem)).toContain('and a logbook of every crossing');
  });

  it('removes an item from the scenes it appears in', () => {
    const result = removeItem(loadExample(), 'item-logbook');
    expect(result.items).toEqual([]);
    expect(checkIntegrity(result)).toEqual([]);
  });

  it('does not change the original adventure', () => {
    const adventure = loadExample();
    removeScene(adventure, 'scene-ferry');
    expect(adventure.scenes).toHaveLength(4);
  });
});

describe('copyAdventure', () => {
  it('gives the copy a new id and title and leaves the original alone', () => {
    const adventure = loadExample();
    const copy = copyAdventure(adventure, 'Copy');
    expect(copy.id).not.toBe(adventure.id);
    expect(copy.title).toBe('Copy');
    nth(copy.scenes, 0).title = 'Changed';
    expect(adventure.scenes[0]?.title).toBe('The Last Ferry');
  });
});

describe('clues', () => {
  it('creates and removes clues', () => {
    const clue = createClue('The key is under the mat.');
    expect(clue).toMatchObject({ text: 'The key is under the mat.', sceneIds: [] });
    const adventure = loadExample();
    adventure.clues.push(clue);
    expect(removeClue(adventure, clue.id).clues.map((c) => c.id)).not.toContain(clue.id);
  });
});

describe('scene images', () => {
  const map = { kind: 'map' as const, title: 'Causeway', mimeType: 'image/webp', src: 'data:,' };

  it('adds an image to a scene', () => {
    const result = addSceneAsset(loadExample(), 'scene-causeway', map);
    const asset = nth(result.assets, result.assets.length - 1);
    expect(asset).toMatchObject(map);
    expect(result.scenes.find((s) => s.id === 'scene-causeway')?.assetIds).toEqual([asset.id]);
    expect(checkIntegrity(result)).toEqual([]);
  });

  it('removes an image from every scene', () => {
    const added = addSceneAsset(loadExample(), 'scene-causeway', map);
    const id = nth(added.assets, added.assets.length - 1).id;
    const result = removeAsset(added, id);
    expect(result.assets.map((a) => a.id)).not.toContain(id);
    expect(result.scenes.flatMap((s) => s.assetIds)).not.toContain(id);
    expect(checkIntegrity(result)).toEqual([]);
  });

  it('drops images with their scene unless another scene shows them', () => {
    let adventure = addSceneAsset(loadExample(), 'scene-causeway', map);
    const own = nth(adventure.assets, adventure.assets.length - 1).id;
    adventure = addSceneAsset(adventure, 'scene-causeway', map);
    const shared = nth(adventure.assets, adventure.assets.length - 1).id;
    adventure.scenes.find((s) => s.id === 'scene-ferry')?.assetIds.push(shared);
    const result = removeScene(adventure, 'scene-causeway');
    const ids = result.assets.map((a) => a.id);
    expect(ids).not.toContain(own);
    expect(ids).toContain(shared);
    expect(checkIntegrity(result)).toEqual([]);
  });
});
