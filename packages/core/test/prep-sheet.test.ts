import { describe, expect, it } from 'vitest';
import { createScene, firstLine, prepSheet } from '../src';
import { loadExample, nth } from './helpers';

describe('prepSheet', () => {
  it('lists scenes in graph order with their purpose and exits', () => {
    const sheet = prepSheet(loadExample());
    expect(sheet.start?.id).toBe('scene-ferry');
    expect(sheet.scenes.map((s) => s.scene.id)).toEqual([
      'scene-ferry',
      'scene-causeway',
      'scene-ferryhouse',
      'scene-island',
    ]);
    const ferry = nth(sheet.scenes, 0);
    expect(ferry.start).toBe(true);
    expect(ferry.line).toBe(ferry.scene.purpose);
    expect(ferry.exits.map((e) => e.target)).toEqual(['The Sunken Causeway', 'The Ferry House']);
  });

  it('falls back to the first line of the notes and puts unreachable scenes last', () => {
    const adventure = loadExample();
    const lonely = { ...createScene('Lonely'), notes: '\n- **Hidden** cave\n- more' };
    adventure.scenes.unshift(lonely);
    const last = nth(prepSheet(adventure).scenes, 4);
    expect(last.scene.id).toBe(lonely.id);
    expect(last.reachable).toBe(false);
    expect(last.line).toBe('**Hidden** cave');
  });

  it('names the scenes of clues and fights and the stats of monsters', () => {
    const sheet = prepSheet(loadExample());
    expect(nth(sheet.clues, 0).scenes).toEqual(['The Last Ferry', 'The Ferry House']);
    const fight = nth(sheet.encounters, 0);
    expect(fight.scene).toBe('The Sunken Causeway');
    expect(nth(fight.monsters, 0)).toMatchObject({ count: 2 });
    expect(nth(fight.monsters, 0).hp).toBeGreaterThan(0);
  });
});

describe('firstLine', () => {
  it('skips empty lines and bullets', () => {
    expect(firstLine('\n\n* one\ntwo')).toBe('one');
    expect(firstLine('')).toBe('');
  });
});
