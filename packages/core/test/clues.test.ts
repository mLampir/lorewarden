import { describe, expect, it } from 'vitest';
import { clueSceneIds, cluesInScene, leadsInScene, removeNpc, removeScene } from '../src';
import { loadExample, nth } from './helpers';

describe('clue leads', () => {
  it('counts the scenes of leads and of their NPCs as places of the clue', () => {
    const adventure = loadExample();
    const clue = nth(adventure.clues, 0);
    clue.sceneIds = [];
    expect(clueSceneIds(adventure, clue)).toEqual(['scene-ferry', 'scene-ferryhouse']);
    expect(cluesInScene(adventure, 'scene-ferry').map((c) => c.id)).toContain(clue.id);
  });

  it('shows only the leads that fit the scene', () => {
    const adventure = loadExample();
    const clue = nth(adventure.clues, 0);
    clue.leads.push({ text: 'Anywhere: a rumour.' });
    const atFerry = leadsInScene(adventure, clue, 'scene-ferry');
    expect(atFerry.here.map((l) => l.text)).toEqual([
      'Witness: Brannoc remembers the girl who never came back.',
      'Anywhere: a rumour.',
    ]);
    expect(atFerry.elsewhere.map((l) => l.sceneId)).toEqual(['scene-ferryhouse']);
  });

  it('keeps a lead when its scene or NPC is removed', () => {
    let adventure = removeScene(loadExample(), 'scene-ferryhouse');
    adventure = removeNpc(adventure, 'npc-brannoc');
    const leads = nth(adventure.clues, 0).leads;
    expect(leads).toHaveLength(2);
    expect(leads.every((l) => l.sceneId === undefined && l.npcId === undefined)).toBe(true);
  });
});
