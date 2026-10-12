import { describe, expect, it } from 'vitest';
import {
  clueSceneIds,
  cluesInScene,
  cluesKnownBy,
  cluesToDiscover,
  removeNpc,
  removeScene,
} from '../src';
import { loadExample, nth } from './helpers';

describe('clue leads', () => {
  it('counts the scenes of leads and of their NPCs as places of the clue', () => {
    const adventure = loadExample();
    const clue = nth(adventure.clues, 0);
    clue.sceneIds = [];
    expect(clueSceneIds(adventure, clue)).toEqual(['scene-ferry', 'scene-ferryhouse']);
    expect(cluesInScene(adventure, 'scene-ferry').map((c) => c.id)).toContain(clue.id);
  });

  it('puts scene leads into the scene and NPC leads with the NPC', () => {
    const adventure = loadExample();
    const clue = nth(adventure.clues, 0);
    clue.leads.push({ text: 'Rumour: people talk.' });
    const atHouse = cluesToDiscover(adventure, 'scene-ferryhouse');
    expect(nth(atHouse, 0).leads.map((l) => l.text)).toEqual([
      'Logbook: her name is the last entry, with no return crossing.',
      'Rumour: people talk.',
    ]);
    // The ferry is listed for the clue, but Brannoc there gives it away, so it is on his card.
    expect(cluesToDiscover(adventure, 'scene-ferry')).toEqual([]);
    expect(cluesToDiscover(adventure, 'scene-island')).toEqual([]);
    expect(cluesKnownBy(adventure, 'npc-brannoc').map((c) => c.leads.length)).toEqual([1, 1]);
    expect(cluesKnownBy(adventure, 'npc-iselde')).toEqual([]);
  });

  it('keeps a lead when its scene or NPC is removed', () => {
    let adventure = removeScene(loadExample(), 'scene-ferryhouse');
    adventure = removeNpc(adventure, 'npc-brannoc');
    const leads = nth(adventure.clues, 0).leads;
    expect(leads).toHaveLength(2);
    expect(leads.every((l) => l.sceneId === undefined && l.npcId === undefined)).toBe(true);
  });
});
