import { clueSceneIds } from './clues';
import {
  assessEncounter,
  type EncounterDifficulty,
  isEncounterDifficulty,
} from './encounter-difficulty';
import { brokenLinks } from './links';
import type { Adventure } from './model';
import { layoutSceneGraph } from './scene-graph';

/**
 * A weak spot in an adventure that still loads fine but may trip up the game master at the table.
 * The app turns the kind into a translated message.
 */
export type ReviewHint =
  | { kind: 'unreachableScene'; sceneId: string }
  | { kind: 'deadEnd'; sceneId: string }
  | { kind: 'emptyScene'; sceneId: string }
  | { kind: 'noEnding' }
  | { kind: 'clueNowhere'; clueId: string }
  | { kind: 'clueInOneScene'; clueId: string }
  | { kind: 'clueWithoutLeads'; clueId: string }
  | { kind: 'puzzleWithoutSolution'; puzzleId: string }
  | { kind: 'puzzleWithoutHints'; puzzleId: string }
  | { kind: 'unusedNpc'; npcId: string }
  | { kind: 'unusedItem'; itemId: string }
  /** A link in the text to an NPC or item the adventure does not have, e.g. after deleting it. */
  | { kind: 'brokenLink'; text: string; id: string }
  | { kind: 'encounterTooHard'; encounterId: string; xp: number; budget: number }
  | { kind: 'climaxWithoutMechanic'; encounterId: string }
  | {
      kind: 'encounterDifficulty';
      encounterId: string;
      stated: EncounterDifficulty;
      actual: EncounterDifficulty;
      xp: number;
    };

/**
 * Looks for unreachable scenes, dead ends, clues the party can easily miss, puzzles that can get
 * the party stuck, unused entries, links to deleted NPCs or items, encounters that do not fit the party and climactic fights
 * without any mechanic.
 */
export function reviewAdventure(adventure: Adventure): ReviewHint[] {
  const hints: ReviewHint[] = [];
  const graph = layoutSceneGraph(adventure);

  for (const node of graph.nodes) {
    if (!node.reachable) hints.push({ kind: 'unreachableScene', sceneId: node.sceneId });
  }
  for (const scene of adventure.scenes) {
    if (scene.exits.length === 0 && !scene.ending) {
      hints.push({ kind: 'deadEnd', sceneId: scene.id });
    }
    if (scene.description.trim() === '') hints.push({ kind: 'emptyScene', sceneId: scene.id });
  }
  if (adventure.scenes.length > 0 && !adventure.scenes.some((scene) => scene.ending)) {
    hints.push({ kind: 'noEnding' });
  }

  for (const clue of adventure.clues) {
    const places = clueSceneIds(adventure, clue).length;
    if (places === 0) hints.push({ kind: 'clueNowhere', clueId: clue.id });
    else if (places === 1) hints.push({ kind: 'clueInOneScene', clueId: clue.id });
    if (places > 0 && clue.leads.length === 0) {
      hints.push({ kind: 'clueWithoutLeads', clueId: clue.id });
    }
  }

  for (const puzzle of adventure.puzzles) {
    if (puzzle.solution.trim() === '') {
      hints.push({ kind: 'puzzleWithoutSolution', puzzleId: puzzle.id });
    }
    if (puzzle.hints.length === 0) hints.push({ kind: 'puzzleWithoutHints', puzzleId: puzzle.id });
  }

  const placedNpcs = new Set(adventure.scenes.flatMap((scene) => scene.npcIds));
  for (const npc of adventure.npcs) {
    if (!placedNpcs.has(npc.id)) hints.push({ kind: 'unusedNpc', npcId: npc.id });
  }
  const placedItems = new Set(adventure.scenes.flatMap((scene) => scene.itemIds));
  for (const item of adventure.items) {
    if (!placedItems.has(item.id)) hints.push({ kind: 'unusedItem', itemId: item.id });
  }
  for (const link of brokenLinks(adventure)) {
    hints.push({ kind: 'brokenLink', text: link.text, id: link.id ?? '' });
  }

  for (const encounter of adventure.encounters) {
    const assessment = assessEncounter(adventure, encounter);
    if (!assessment) continue;
    const { xp, budget, rating } = assessment;
    if (rating === 'beyond') {
      hints.push({ kind: 'encounterTooHard', encounterId: encounter.id, xp, budget: budget.high });
    } else if (isEncounterDifficulty(encounter.difficulty) && encounter.difficulty !== rating) {
      hints.push({
        kind: 'encounterDifficulty',
        encounterId: encounter.id,
        stated: encounter.difficulty,
        actual: rating,
        xp,
      });
    }
  }

  // Boss fights and climaxes are more memorable with a twist than as an exchange of blows.
  const endings = new Set(adventure.scenes.filter((s) => s.ending).map((s) => s.id));
  for (const encounter of adventure.encounters) {
    if (encounter.mechanics.length > 0 || encounter.monsters.length === 0) continue;
    const inEnding =
      (encounter.sceneId !== undefined && endings.has(encounter.sceneId)) ||
      adventure.scenes.some((s) => s.ending && s.encounterIds.includes(encounter.id));
    if (inEnding || encounter.difficulty === 'high') {
      hints.push({ kind: 'climaxWithoutMechanic', encounterId: encounter.id });
    }
  }

  return hints;
}
