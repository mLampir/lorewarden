import { describe, expect, it } from 'vitest';
import { createScene, layoutSceneGraph } from '../src';
import { loadExample } from './helpers';

describe('layoutSceneGraph', () => {
  it('places scenes in columns by distance from the start', () => {
    const graph = layoutSceneGraph(loadExample());
    const at = (id: string) => graph.nodes.find((n) => n.sceneId === id);
    expect(at('scene-ferry')).toMatchObject({ column: 0, row: 0, reachable: true });
    expect(at('scene-causeway')).toMatchObject({ column: 1, row: 0 });
    expect(at('scene-ferryhouse')).toMatchObject({ column: 1, row: 1 });
    expect(at('scene-island')).toMatchObject({ column: 2, row: 0 });
    expect(graph.columns).toBe(3);
    expect(graph.rows).toBe(2);
    expect(graph.edges).toHaveLength(4);
  });

  it('puts unreachable scenes below and marks them', () => {
    const adventure = loadExample();
    const lonely = createScene('Lonely');
    adventure.scenes.push(lonely);
    const graph = layoutSceneGraph(adventure);
    expect(graph.nodes.find((n) => n.sceneId === lonely.id)).toEqual({
      sceneId: lonely.id,
      column: 0,
      row: 2,
      reachable: false,
    });
    expect(graph.rows).toBe(3);
  });

  it('ignores exits to missing scenes', () => {
    const adventure = loadExample();
    adventure.scenes[0]?.exits.push({ label: 'Nowhere', targetSceneId: 'missing' });
    expect(layoutSceneGraph(adventure).edges).toHaveLength(4);
  });

  it('handles an adventure without scenes', () => {
    const adventure = loadExample();
    adventure.scenes = [];
    expect(layoutSceneGraph(adventure)).toEqual({ nodes: [], edges: [], columns: 0, rows: 0 });
  });
});
