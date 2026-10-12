import type { Adventure, Clue, ClueLead } from './model';

/**
 * Scenes where a clue can be found: the ones listed on the clue, the scenes of its leads and the
 * scenes where the NPC of a lead appears. In the order of the adventure's scenes.
 */
export function clueSceneIds(adventure: Adventure, clue: Clue): string[] {
  const ids = new Set(clue.sceneIds);
  for (const lead of clue.leads) {
    if (lead.sceneId) ids.add(lead.sceneId);
    if (lead.npcId) {
      for (const scene of adventure.scenes) {
        if (scene.npcIds.includes(lead.npcId)) ids.add(scene.id);
      }
    }
  }
  return adventure.scenes.filter((scene) => ids.has(scene.id)).map((scene) => scene.id);
}

/** Clues that can be found in a scene. */
export function cluesInScene(adventure: Adventure, sceneId: string): Clue[] {
  return adventure.clues.filter((clue) => clueSceneIds(adventure, clue).includes(sceneId));
}

/**
 * Splits the leads of a clue into those that can turn up in a scene (tied to the scene, to an NPC
 * who is there, or to no place at all) and those that belong somewhere else.
 */
export function leadsInScene(
  adventure: Adventure,
  clue: Clue,
  sceneId: string,
): { here: ClueLead[]; elsewhere: ClueLead[] } {
  const npcIds = adventure.scenes.find((scene) => scene.id === sceneId)?.npcIds ?? [];
  const here: ClueLead[] = [];
  const elsewhere: ClueLead[] = [];
  for (const lead of clue.leads) {
    const fits =
      lead.sceneId === sceneId ||
      (lead.npcId !== undefined && npcIds.includes(lead.npcId)) ||
      (lead.sceneId === undefined && lead.npcId === undefined);
    (fits ? here : elsewhere).push(lead);
  }
  return { here, elsewhere };
}
