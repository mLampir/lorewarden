import { describe, expect, it } from 'vitest';
import {
  Adventure,
  addReveal,
  checkIntegrity,
  createPuzzle,
  createPuzzleHint,
  hideReveal,
  playerView,
  removeAsset,
  removePuzzle,
  removeScene,
  reviewAdventure,
  Session,
  setPuzzleAsset,
  startSession,
  tableState,
  togglePuzzleSolved,
} from '../src';
import { loadExample, nth } from './helpers';

const now = new Date('2026-01-01T18:00:00Z');
const later = new Date('2026-01-01T18:05:00Z');
const wren = { id: 'player-wren', name: 'Wren' };
const ash = { id: 'player-ash', name: 'Ash' };
const svg = {
  kind: 'handout',
  title: 'Lock',
  mimeType: 'image/svg+xml',
  src: 'data:,<svg/>',
} as const;

describe('puzzles in the example', () => {
  it('load with their image and hints', () => {
    const adventure = loadExample();
    const puzzle = nth(adventure.puzzles, 0);
    expect(puzzle.sceneId).toBe('scene-island');
    expect(puzzle.hints).toHaveLength(3);
    expect(adventure.assets.find((a) => a.id === puzzle.assetId)?.mimeType).toBe('image/svg+xml');
    expect(checkIntegrity(adventure)).toEqual([]);
  });
});

describe('editing puzzles', () => {
  it('creates a puzzle in a scene', () => {
    const puzzle = createPuzzle('Riddle', 'scene-ferry');
    expect(puzzle).toMatchObject({ title: 'Riddle', sceneId: 'scene-ferry', hints: [] });
    expect(puzzle.id).toMatch(/^puzzle-/);
    expect(createPuzzleHint('Look up').id).toMatch(/^hint-/);
  });

  it('replaces the image of a puzzle and removes the old one', () => {
    const before = loadExample();
    const oldAsset = nth(before.puzzles, 0).assetId;
    const after = setPuzzleAsset(before, 'puzzle-tower-door', svg);
    const newAsset = nth(after.puzzles, 0).assetId;
    expect(newAsset).not.toBe(oldAsset);
    expect(after.assets.map((a) => a.id)).toEqual([newAsset]);
    expect(checkIntegrity(after)).toEqual([]);
  });

  it('keeps an image a scene still shows', () => {
    let adventure = loadExample();
    adventure = {
      ...adventure,
      scenes: adventure.scenes.map((s) =>
        s.id === 'scene-island' ? { ...s, assetIds: ['asset-tower-door'] } : s,
      ),
    };
    expect(removePuzzle(adventure, 'puzzle-tower-door').assets).toHaveLength(1);
    expect(removePuzzle(loadExample(), 'puzzle-tower-door').assets).toHaveLength(0);
  });

  it('forgets removed scenes and images', () => {
    const withoutScene = removeScene(loadExample(), 'scene-island');
    expect(nth(withoutScene.puzzles, 0).sceneId).toBeUndefined();
    expect(withoutScene.assets).toHaveLength(1);
    const withoutImage = removeAsset(loadExample(), 'asset-tower-door');
    expect(nth(withoutImage.puzzles, 0).assetId).toBeUndefined();
    expect(checkIntegrity(withoutImage)).toEqual([]);
    expect(Adventure.safeParse(JSON.parse(JSON.stringify(withoutImage))).success).toBe(true);
  });

  it('finds broken references and puzzles that can get the party stuck', () => {
    const adventure = loadExample();
    const broken = {
      ...adventure,
      puzzles: [
        { ...createPuzzle('Broken', 'scene-nowhere'), assetId: 'asset-nowhere' },
        {
          ...createPuzzle('Twice'),
          solution: 'Yes',
          hints: [
            { id: 'hint-a', text: 'One' },
            { id: 'hint-a', text: 'Two' },
          ],
        },
      ],
    };
    expect(checkIntegrity(broken).map((p) => p.path)).toEqual([
      'puzzles[0].sceneId',
      'puzzles[0].assetId',
      'puzzles[1].hints[1].id',
    ]);
    const id = nth(broken.puzzles, 0).id;
    expect(reviewAdventure(broken)).toEqual(
      expect.arrayContaining([
        { kind: 'puzzleWithoutSolution', puzzleId: id },
        { kind: 'puzzleWithoutHints', puzzleId: id },
      ]),
    );
    expect(reviewAdventure(adventure).some((h) => h.kind.startsWith('puzzle'))).toBe(false);
  });
});

describe('puzzles at the table', () => {
  it('shows a puzzle with its image and hints to some players', () => {
    const adventure = loadExample();
    let session = startSession(adventure, undefined, now);
    session = addReveal(session, { kind: 'puzzle', puzzleId: 'puzzle-tower-door', to: 'all' }, now);
    session = addReveal(
      session,
      {
        kind: 'puzzleHint',
        puzzleId: 'puzzle-tower-door',
        hintId: 'hint-door-seventh',
        to: [wren.id],
      },
      later,
    );
    expect(Session.safeParse(session).success).toBe(true);

    const state = tableState(adventure, session, 'K7QM2X');
    const [puzzle, hint] = state.reveals;
    expect(puzzle).toMatchObject({
      title: 'The Tower Door',
      tag: 'puzzle',
      solved: false,
      image: { mimeType: 'image/svg+xml' },
    });
    expect(puzzle?.text).toContain('Seven stone lamps');
    expect(hint).toMatchObject({
      title: 'The Tower Door',
      text: 'The lantern appears every seventh night.',
      tag: 'hint',
      to: [wren.id],
    });

    const forWren = playerView(state, wren, (id) => `/img/${id}`);
    expect(forWren.reveals.map((r) => r.tag)).toEqual(['hint', 'puzzle']);
    expect(forWren.reveals[1]).toMatchObject({ imageUrl: `/img/${puzzle?.id}`, personal: false });
    expect(playerView(state, ash, () => '').reveals.map((r) => r.tag)).toEqual(['puzzle']);

    const hintId = nth(session.revealed, 1).id;
    expect(tableState(adventure, hideReveal(session, hintId), 'K7QM2X').reveals).toHaveLength(1);
  });

  it('marks a solved puzzle on the phones', () => {
    const adventure = loadExample();
    let session = startSession(adventure, undefined, now);
    session = addReveal(session, { kind: 'puzzle', puzzleId: 'puzzle-tower-door', to: 'all' }, now);
    session = togglePuzzleSolved(session, 'puzzle-tower-door');
    const state = tableState(adventure, session, 'K7QM2X');
    expect(state.reveals[0]?.solved).toBe(true);
    expect(playerView(state, wren, () => '').reveals[0]?.solved).toBe(true);
    expect(togglePuzzleSolved(session, 'puzzle-tower-door').solvedPuzzleIds).toEqual([]);
  });

  it('leaves out puzzles and hints the adventure no longer has', () => {
    const adventure = loadExample();
    let session = startSession(adventure, undefined, now);
    session = addReveal(session, { kind: 'puzzle', puzzleId: 'puzzle-tower-door', to: 'all' }, now);
    session = addReveal(
      session,
      { kind: 'puzzleHint', puzzleId: 'puzzle-tower-door', hintId: 'hint-gone', to: 'all' },
      now,
    );
    expect(tableState(adventure, session, 'K7QM2X').reveals).toHaveLength(1);
    const without = removePuzzle(adventure, 'puzzle-tower-door');
    expect(tableState(without, session, 'K7QM2X').reveals).toEqual([]);
  });
});
