import type { Adventure, ReviewHint } from '@lorewarden/core';

type Translate = (key: string, values?: Record<string, unknown>) => string;

/** Encounters have no name of their own, so they are named after the scene they happen in. */
export function encounterPlace(adventure: Adventure, encounterId: string): string {
  const encounter = adventure.encounters.find((e) => e.id === encounterId);
  const scene =
    adventure.scenes.find((s) => s.id === encounter?.sceneId) ??
    adventure.scenes.find((s) => s.encounterIds.includes(encounterId));
  return scene?.title ?? encounterId;
}

/** Turns a review hint into a sentence that names the scene, clue, puzzle, NPC or item. */
export function describeHint(t: Translate, adventure: Adventure, hint: ReviewHint): string {
  switch (hint.kind) {
    case 'noEnding':
      return t('review.noEnding');
    case 'clueNowhere':
    case 'clueInOneScene': {
      const clue = adventure.clues.find((c) => c.id === hint.clueId);
      return t(`review.${hint.kind}`, { name: clue?.text ?? hint.clueId });
    }
    case 'puzzleWithoutSolution':
    case 'puzzleWithoutHints': {
      const puzzle = adventure.puzzles.find((p) => p.id === hint.puzzleId);
      return t(`review.${hint.kind}`, { name: puzzle?.title ?? hint.puzzleId });
    }
    case 'unusedNpc':
      return t('review.unusedNpc', {
        name: adventure.npcs.find((n) => n.id === hint.npcId)?.name ?? hint.npcId,
      });
    case 'unusedItem':
      return t('review.unusedItem', {
        name: adventure.items.find((i) => i.id === hint.itemId)?.name ?? hint.itemId,
      });
    case 'encounterTooHard':
      return t('review.encounterTooHard', {
        name: encounterPlace(adventure, hint.encounterId),
        xp: hint.xp,
        budget: hint.budget,
      });
    case 'encounterDifficulty':
      return t('review.encounterDifficulty', {
        name: encounterPlace(adventure, hint.encounterId),
        stated: t(`review.difficulty.${hint.stated}`),
        actual: t(`review.difficulty.${hint.actual}`),
        xp: hint.xp,
      });
    case 'climaxWithoutMechanic':
      return t('review.climaxWithoutMechanic', {
        name: encounterPlace(adventure, hint.encounterId),
      });
    default:
      return t(`review.${hint.kind}`, {
        name: adventure.scenes.find((s) => s.id === hint.sceneId)?.title ?? hint.sceneId,
      });
  }
}
