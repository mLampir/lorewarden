import { describe, expect, it } from 'vitest';
import { parseAdventure, serializeAdventure } from '../src';
import { example, loadExample } from './helpers';

describe('adventure files', () => {
  it('accepts the bundled example adventure', () => {
    const adventure = loadExample();
    expect(adventure.title).toBe('The Lantern in the Marsh');
    expect(adventure.scenes).toHaveLength(4);
  });

  it('fills defaults for omitted lists', () => {
    const ferryHouse = loadExample().scenes.find((s) => s.id === 'scene-ferryhouse');
    expect(ferryHouse?.npcIds).toEqual([]);
    expect(ferryHouse?.encounterIds).toEqual([]);
  });

  it('gives NPCs from older files an empty voice', () => {
    const file = JSON.parse(example);
    for (const npc of file.adventure.npcs) delete npc.voice;
    const result = parseAdventure(JSON.stringify(file));
    expect(result.ok && result.adventure.npcs.map((n) => n.voice)).toEqual(['', '']);
  });

  it('survives an export and re-import unchanged', () => {
    const adventure = loadExample();
    const again = parseAdventure(serializeAdventure(adventure, new Date('2026-01-01T00:00:00Z')));
    expect(again).toEqual({ ok: true, adventure });
  });

  it('reports invalid JSON', () => {
    const result = parseAdventure('{ not json');
    expect(result.ok).toBe(false);
  });

  it('rejects files from other tools', () => {
    const result = parseAdventure(JSON.stringify({ format: 'something-else', version: 1 }));
    expect(result.ok).toBe(false);
  });

  it('reports schema problems with their path', () => {
    const raw = JSON.parse(example);
    raw.adventure.party.level = 25;
    const result = parseAdventure(JSON.stringify(raw));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems.map((p) => p.path)).toContain('adventure.party.level');
  });

  it('reports exits that lead nowhere', () => {
    const raw = JSON.parse(example);
    raw.adventure.scenes[0].exits[0].targetSceneId = 'scene-missing';
    const result = parseAdventure(JSON.stringify(raw));
    expect(result).toEqual({
      ok: false,
      problems: [
        { path: 'scenes[0].exits[0].targetSceneId', message: 'Unknown scene "scene-missing"' },
      ],
    });
  });

  it('reports duplicate ids', () => {
    const raw = JSON.parse(example);
    raw.adventure.npcs[1].id = raw.adventure.npcs[0].id;
    const result = parseAdventure(JSON.stringify(raw));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems.map((p) => p.message)).toContain('Duplicate id "npc-brannoc"');
    }
  });

  it('rejects a pool entry whose minimum count exceeds its maximum', () => {
    const raw = JSON.parse(example);
    raw.adventure.monsterPool[0].count = { min: 4, max: 2 };
    expect(parseAdventure(JSON.stringify(raw)).ok).toBe(false);
  });
});
