import { describe, expect, it } from 'vitest';
import {
  addLogNote,
  createCombatant,
  editLogEntry,
  moveToScene,
  removeLogEntry,
  Session,
  startSession,
} from '../src';
import { loadExample, nth } from './helpers';

const now = new Date('2026-01-01T18:00:00Z');

describe('sessions', () => {
  it('starts at the start scene and logs it', () => {
    const session = startSession(loadExample(), undefined, now);
    expect(session.currentSceneId).toBe('scene-ferry');
    expect(session.log).toEqual([
      expect.objectContaining({ kind: 'scene', text: 'The Last Ferry', sceneId: 'scene-ferry' }),
    ]);
    expect(Session.safeParse(session).success).toBe(true);
  });

  it('carries player characters over from the previous session', () => {
    const adventure = loadExample();
    const previous = startSession(adventure, undefined, now);
    const pc = { ...createCombatant({ name: 'Wren', kind: 'pc', initiative: 12 }) };
    pc.conditions = ['prone'];
    previous.initiative = [pc, createCombatant({ name: 'Eel', kind: 'monster', initiative: 5 })];
    const next = startSession(adventure, previous, now);
    expect(next.initiative).toEqual([{ ...pc, conditions: [] }]);
    expect(next.id).not.toBe(previous.id);
  });

  it('logs scene changes but not staying in the same scene', () => {
    const adventure = loadExample();
    let session = startSession(adventure, undefined, now);
    const causeway = nth(adventure.scenes, 2);
    session = moveToScene(session, causeway, now);
    session = moveToScene(session, causeway, now);
    expect(session.currentSceneId).toBe('scene-causeway');
    expect(session.log).toHaveLength(2);
  });

  it('adds, edits and removes notes', () => {
    let session = startSession(loadExample(), undefined, now);
    session = addLogNote(session, '  The party bribed the ferryman.  ', now);
    session = addLogNote(session, '   ', now);
    expect(session.log).toHaveLength(2);
    const note = nth(session.log, 1);
    expect(note).toMatchObject({ kind: 'note', text: 'The party bribed the ferryman.' });
    expect(note.sceneId).toBe('scene-ferry');

    session = editLogEntry(session, note.id, 'Paid double.');
    expect(session.log[1]?.text).toBe('Paid double.');
    session = editLogEntry(session, note.id, '');
    expect(session.log).toHaveLength(1);
    expect(removeLogEntry(session, nth(session.log, 0).id).log).toEqual([]);
  });
});
