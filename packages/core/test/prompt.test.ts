import { describe, expect, it } from 'vitest';
import {
  buildAdaptPrompt,
  buildAdventurePrompt,
  copyAdventure,
  describeLanguage,
  parseAdaptedAdventure,
  parseAdventure,
  promptExample,
  reviewAdventure,
} from '../src';
import { loadExample, nth } from './helpers';

describe('buildAdventurePrompt', () => {
  it('contains the request and an example file Lorewarden can import', () => {
    const prompt = buildAdventurePrompt({
      idea: 'A haunted lighthouse',
      partySize: 5,
      partyLevel: 3,
      length: 'one-shot',
      language: 'de',
    });
    expect(prompt).toContain('5 characters of level 3');
    expect(prompt).toContain('A haunted lighthouse');
    expect(prompt).toContain('Language of all adventure text: German (de)');
    expect(prompt).toContain('"language" is "de"');
    expect(prompt).toContain('each built on a different kind of quest: defeat a leader');
    expect(prompt).toContain('how I make it easier and how I make it harder');

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
      language: 'en',
    });
    expect(prompt).toContain('none yet, surprise me');
  });

  it('asks for a voice for every NPC', () => {
    const prompt = buildAdventurePrompt({
      idea: '',
      partySize: 4,
      partyLevel: 1,
      length: 'one-shot',
      language: 'en',
    });
    expect(prompt).toContain('a voice I can perform at the table');
    expect(prompt).toContain('Give every NPC a "voice"');
  });

  it('asks for rules terms in another language only when they differ from the text', () => {
    const request = { idea: '', partySize: 4, partyLevel: 1, length: 'one-shot' as const };
    const mixed = buildAdventurePrompt({ ...request, language: 'de', termsLanguage: 'en' });
    expect(mixed).toContain('- Rules terms: English (en).');
    expect(mixed).toContain('"termsLanguage" is "en"');
    const same = buildAdventurePrompt({ ...request, language: 'en', termsLanguage: 'en' });
    expect(same).not.toContain('Rules terms');
    expect(same).not.toContain('termsLanguage');

    const adventure = loadExample();
    adventure.language = 'de';
    adventure.termsLanguage = 'en';
    expect(buildAdaptPrompt(adventure)).toContain('- Rules terms: English (en).');
  });

  it('names the language in English and falls back to the tag', () => {
    expect(describeLanguage('es')).toBe('Spanish (es)');
    expect(describeLanguage('not a tag')).toBe('not a tag');
  });

  it('uses an example without review hints', () => {
    expect(reviewAdventure(promptExample.adventure)).toEqual([]);
  });

  it('tells the AI the XP budget of the party', () => {
    const prompt = buildAdventurePrompt({
      idea: '',
      partySize: 5,
      partyLevel: 3,
      length: 'one-shot',
      language: 'en',
    });
    expect(prompt).toContain('up to 750 XP is "low"');
    expect(prompt).toContain('up to 2000 XP is "high"');
  });
});

describe('buildAdaptPrompt', () => {
  const original = loadExample();
  original.assets.push({
    id: 'asset-map',
    kind: 'map',
    title: 'Marsh map',
    mimeType: 'image/png',
    src: 'data:image/png;base64,AAAA',
  });
  nth(original.scenes, 0).assetIds.push('asset-map');
  const adapted = copyAdventure(original, 'For one', { size: 1, level: 1 });

  it('names the new party and the encounters that no longer fit, without asset data', () => {
    const prompt = buildAdaptPrompt(adapted);
    expect(prompt).toContain('Party: 1 characters of level 1');
    expect(prompt).toContain('Everything else stays word for word');
    expect(prompt).not.toContain('## The characters');
    expect(prompt).toContain('"enc-causeway": 200 XP, meant to be low, now above the high budget');
    expect(prompt).not.toContain('base64');
  });

  it('says so when every encounter still fits', () => {
    expect(buildAdaptPrompt(original)).toContain('every encounter fits the party');
  });

  it('works in the characters once the game master knows them', () => {
    const known = copyAdventure(original, 'Known', {
      ...original.party,
      characters: 'Mira, ranger, grew up on the marsh',
    });
    const prompt = buildAdaptPrompt(known);
    expect(prompt).toContain('## The characters');
    expect(prompt).toContain('Mira, ranger, grew up on the marsh');
    expect(prompt).toContain('give every character one moment');
    expect(prompt).not.toContain('Everything else stays word for word');
  });

  it('takes the answer back with the id and assets of the adventure', () => {
    const file = /## The adventure\n\n```json\n([\s\S]*?)\n```/.exec(
      buildAdaptPrompt(adapted),
    )?.[1];
    const answer = JSON.parse(file ?? '');
    answer.adventure.id = 'adv-made-up';
    answer.adventure.encounters[0].monsters[0].count = 1;
    const result = parseAdaptedAdventure(adapted, JSON.stringify(answer));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.adventure.id).toBe(adapted.id);
    expect(result.adventure.assets).toEqual(adapted.assets);
    expect(reviewAdventure(result.adventure).map((hint) => hint.kind)).not.toContain(
      'encounterTooHard',
    );
  });

  it('reports problems in an answer that is not an adventure file', () => {
    expect(parseAdaptedAdventure(adapted, '[]').ok).toBe(false);
    expect(parseAdaptedAdventure(adapted, 'nope').ok).toBe(false);
  });
});
