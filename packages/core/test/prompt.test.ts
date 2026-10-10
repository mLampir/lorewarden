import { describe, expect, it } from 'vitest';
import { buildAdventurePrompt, parseAdventure, promptExample, reviewAdventure } from '../src';

describe('buildAdventurePrompt', () => {
  it('contains the request and an example file Lorewarden can import', () => {
    const prompt = buildAdventurePrompt({
      idea: 'A haunted lighthouse',
      partySize: 5,
      partyLevel: 3,
      length: 'one-shot',
      language: 'German',
    });
    expect(prompt).toContain('5 characters of level 3');
    expect(prompt).toContain('A haunted lighthouse');
    expect(prompt).toContain('Language of all adventure text: German');

    const example = /```json\n([\s\S]*?)\n```/.exec(prompt)?.[1];
    expect(example).toBeDefined();
    const result = parseAdventure(example ?? '');
    expect(result.ok).toBe(true);
  });

  it('asks for a surprise when there is no idea yet', () => {
    const prompt = buildAdventurePrompt({
      idea: '  ',
      partySize: 4,
      partyLevel: 1,
      length: 'two-evenings',
      language: 'English',
    });
    expect(prompt).toContain('none yet, surprise me');
  });

  it('uses an example without review hints', () => {
    expect(reviewAdventure(promptExample.adventure)).toEqual([]);
  });
});
