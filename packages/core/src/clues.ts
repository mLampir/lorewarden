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

/** A clue together with the ways to find it that belong to one place. */
export interface ClueWithLeads {
  clue: Clue;
  leads: ClueLead[];
}

/**
 * What the party can discover in a scene itself, each clue with the leads tied to the scene and
 * those tied to no place: clues with a lead in the scene, and clues listed for the scene unless an
 * NPC who is there already gives them away. Leads of NPCs belong to the NPC (see cluesKnownBy).
 */
export function cluesToDiscover(adventure: Adventure, sceneId: string): ClueWithLeads[] {
  const npcIds = adventure.scenes.find((scene) => scene.id === sceneId)?.npcIds ?? [];
  return adventure.clues.flatMap((clue) => {
    const leads = clue.leads.filter(
      (lead) =>
        lead.sceneId === sceneId || (lead.sceneId === undefined && lead.npcId === undefined),
    );
    const byNpc = clue.leads.some((lead) => lead.npcId && npcIds.includes(lead.npcId));
    const tied =
      leads.some((lead) => lead.sceneId === sceneId) || (clue.sceneIds.includes(sceneId) && !byNpc);
    return tied ? [{ clue, leads }] : [];
  });
}

/** What an NPC can give away: clues with a lead tied to the NPC, each with those leads. */
export function cluesKnownBy(adventure: Adventure, npcId: string): ClueWithLeads[] {
  return adventure.clues.flatMap((clue) => {
    const leads = clue.leads.filter((lead) => lead.npcId === npcId);
    return leads.length > 0 ? [{ clue, leads }] : [];
  });
}
