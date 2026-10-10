import type { Adventure } from './model';

export interface SceneNode {
  sceneId: string;
  /** Number of moves from the root of its group; the start scene is column 0. */
  column: number;
  row: number;
  /** False for scenes the party cannot reach from the start scene. */
  reachable: boolean;
}

export interface SceneEdge {
  from: string;
  to: string;
  label: string;
}

export interface SceneGraph {
  nodes: SceneNode[];
  edges: SceneEdge[];
  columns: number;
  rows: number;
}

/**
 * Lays scenes out in columns by their distance from the start scene.
 * Scenes that cannot be reached from the start form their own groups below.
 */
export function layoutSceneGraph(adventure: Adventure): SceneGraph {
  const scenes = new Map(adventure.scenes.map((scene) => [scene.id, scene]));
  const edges: SceneEdge[] = adventure.scenes.flatMap((scene) =>
    scene.exits
      .filter((exit) => scenes.has(exit.targetSceneId))
      .map((exit) => ({ from: scene.id, to: exit.targetSceneId, label: exit.label })),
  );

  const nodes = new Map<string, SceneNode>();
  let rowOffset = 0;

  const placeGroup = (rootId: string, reachable: boolean) => {
    const rowsPerColumn: number[] = [];
    const queue: { id: string; column: number }[] = [{ id: rootId, column: 0 }];
    const placed: SceneNode[] = [];
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next || nodes.has(next.id)) continue;
      const row = rowsPerColumn[next.column] ?? 0;
      rowsPerColumn[next.column] = row + 1;
      const node = { sceneId: next.id, column: next.column, row: rowOffset + row, reachable };
      nodes.set(next.id, node);
      placed.push(node);
      for (const exit of scenes.get(next.id)?.exits ?? []) {
        if (scenes.has(exit.targetSceneId) && !nodes.has(exit.targetSceneId)) {
          queue.push({ id: exit.targetSceneId, column: next.column + 1 });
        }
      }
    }
    rowOffset += Math.max(0, ...rowsPerColumn);
  };

  const startId =
    adventure.startSceneId && scenes.has(adventure.startSceneId)
      ? adventure.startSceneId
      : undefined;
  if (startId) placeGroup(startId, true);
  for (const scene of adventure.scenes) {
    if (!nodes.has(scene.id)) placeGroup(scene.id, startId === undefined);
  }

  const list = adventure.scenes.flatMap((scene) => nodes.get(scene.id) ?? []);
  return {
    nodes: list,
    edges,
    columns: Math.max(0, ...list.map((node) => node.column + 1)),
    rows: rowOffset,
  };
}
