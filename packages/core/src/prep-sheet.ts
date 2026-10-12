import { clueSceneIds } from './clues';
import type { Adventure, Clue, Npc, Puzzle, Scene } from './model';
import { resolvePoolMonster } from './monsters';
import { layoutSceneGraph } from './scene-graph';

/** A scene in one line, for reading the whole adventure before the session. */
export interface PrepScene {
  scene: Scene;
  /** The scene's purpose, or the first line of its notes while it has none. */
  line: string;
  start: boolean;
  /** False for scenes the party cannot reach from the start scene. */
  reachable: boolean;
  exits: { label: string; target: string; condition?: string }[];
}

export interface PrepMonster {
  name: string;
  count: number;
  cr: number;
  ac?: number;
  hp?: number;
}

export interface PrepEncounter {
  id: string;
  /** Title of the scene the fight happens in, if it has one. */
  scene?: string;
  difficulty?: string;
  monsters: PrepMonster[];
}

export interface PrepSheet {
  start?: Scene;
  scenes: PrepScene[];
  clues: {
    clue: Clue;
    scenes: string[];
    /** Ways to find the clue, each with the scene or NPC it belongs to. */
    leads: { text: string; where?: string }[];
  }[];
  npcs: { npc: Npc; scenes: string[] }[];
  encounters: PrepEncounter[];
  puzzles: { puzzle: Puzzle; scene?: string }[];
}

/** First line with text, without a bullet in front. */
export function firstLine(text: string): string {
  const line = text.split(/\r?\n/).find((l) => l.trim() !== '') ?? '';
  return line.replace(/^\s*[-*•]\s+/, '').trim();
}

/**
 * Puts the whole adventure on one page for preparation: scenes in the order the party meets them,
 * then clues, NPCs, fights and puzzles, each with the scenes they belong to.
 */
export function prepSheet(adventure: Adventure): PrepSheet {
  const scenesById = new Map(adventure.scenes.map((scene) => [scene.id, scene]));
  const title = (id: string | undefined) => (id ? scenesById.get(id)?.title : undefined);
  // Graph order: by distance from the start scene; scenes the party cannot reach come last.
  const ordered = [...layoutSceneGraph(adventure).nodes].sort(
    (a, b) => Number(b.reachable) - Number(a.reachable) || a.column - b.column || a.row - b.row,
  );

  const scenes = ordered.flatMap((node): PrepScene[] => {
    const scene = scenesById.get(node.sceneId);
    if (!scene) return [];
    return [
      {
        scene,
        line: scene.purpose.trim() || firstLine(scene.notes),
        start: scene.id === adventure.startSceneId,
        reachable: node.reachable,
        exits: scene.exits.map((exit) => ({
          label: exit.label,
          target: title(exit.targetSceneId) ?? exit.targetSceneId,
          condition: exit.condition,
        })),
      },
    ];
  });

  const encounterScene = (id: string, sceneId?: string) =>
    title(sceneId) ?? adventure.scenes.find((s) => s.encounterIds.includes(id))?.title;

  return {
    start: adventure.startSceneId ? scenesById.get(adventure.startSceneId) : undefined,
    scenes,
    clues: adventure.clues.map((clue) => ({
      clue,
      scenes: clueSceneIds(adventure, clue).flatMap((id) => title(id) ?? []),
      leads: clue.leads.map((lead) => ({
        text: lead.text,
        where: adventure.npcs.find((npc) => npc.id === lead.npcId)?.name ?? title(lead.sceneId),
      })),
    })),
    npcs: adventure.npcs.map((npc) => ({
      npc,
      scenes: adventure.scenes.filter((s) => s.npcIds.includes(npc.id)).map((s) => s.title),
    })),
    encounters: adventure.encounters.map((encounter) => ({
      id: encounter.id,
      scene: encounterScene(encounter.id, encounter.sceneId),
      difficulty: encounter.difficulty,
      monsters: encounter.monsters.map((entry) => {
        const pool = adventure.monsterPool.find((m) => m.id === entry.poolMonsterId);
        const resolved = pool ? resolvePoolMonster(adventure, pool) : undefined;
        return {
          name: entry.name ?? resolved?.name ?? entry.poolMonsterId,
          count: entry.count,
          cr: resolved?.cr ?? 0,
          ac: resolved?.ac,
          hp: entry.hp ?? resolved?.hp,
        };
      }),
    })),
    puzzles: adventure.puzzles.map((puzzle) => ({ puzzle, scene: title(puzzle.sceneId) })),
  };
}
