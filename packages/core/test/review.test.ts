import { describe, expect, it } from 'vitest';
import { createAdventure, createClue, createNpc, reviewAdventure } from '../src';
import { loadExample, nth } from './helpers';

describe('reviewAdventure', () => {
  it('finds nothing to improve in the example', () => {
    expect(reviewAdventure(loadExample())).toEqual([]);
  });

  it('flags a clue in one scene and a clue without ways to find it', () => {
    const adventure = loadExample();
    const clue = nth(adventure.clues, 1);
    clue.leads = [];
    expect(reviewAdventure(adventure)).toEqual([
      { kind: 'clueInOneScene', clueId: clue.id },
      { kind: 'clueWithoutLeads', clueId: clue.id },
    ]);
  });

  it('flags dead ends, missing endings, empty scenes and unused entries', () => {
    const adventure = createAdventure({ title: 'Test', partySize: 4, partyLevel: 1 });
    const start = nth(adventure.scenes, 0);
    adventure.npcs.push({ ...createNpc('Ghost'), id: 'npc-ghost' });
    adventure.clues.push({ ...createClue('A clue'), id: 'clue-lost' });
    expect(reviewAdventure(adventure)).toEqual([
      { kind: 'deadEnd', sceneId: start.id },
      { kind: 'emptyScene', sceneId: start.id },
      { kind: 'noEnding' },
      { kind: 'clueNowhere', clueId: 'clue-lost' },
      { kind: 'unusedNpc', npcId: 'npc-ghost' },
    ]);
  });

  it('accepts a scene without exits once it is marked as an ending', () => {
    const adventure = createAdventure({ title: 'Test', partySize: 4, partyLevel: 1 });
    const start = nth(adventure.scenes, 0);
    start.ending = true;
    start.description = 'The end.';
    expect(reviewAdventure(adventure)).toEqual([]);
  });

  it('flags scenes the party cannot reach', () => {
    const adventure = loadExample();
    adventure.scenes = adventure.scenes.map((scene) =>
      scene.id === 'scene-causeway' ? { ...scene, exits: [] } : scene,
    );
    expect(reviewAdventure(adventure)).toContainEqual({
      kind: 'unreachableScene',
      sceneId: 'scene-island',
    });
  });
});
