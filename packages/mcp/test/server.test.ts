import { copyFile, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseAdventure } from '@lorewarden/core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer, newAdventurePrompt } from '../src/server';
import { AdventureStore, slug } from '../src/store';

let dir: string;
let client: Client;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lorewarden-mcp-'));
  const server = createServer(new AdventureStore(dir));
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(clientSide);
});

afterEach(async () => {
  await client.close();
  await rm(dir, { recursive: true, force: true });
});

async function call(name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  const content = result.content as { type: string; text: string }[];
  const body = content[0]?.text ?? '';
  return { isError: result.isError === true, body };
}

async function callJson(name: string, args: Record<string, unknown> = {}) {
  const { isError, body } = await call(name, args);
  if (isError) throw new Error(body);
  return JSON.parse(body);
}

async function readOnlyFile() {
  const files = (await readdir(dir)).filter((file) => file.endsWith('.adventure.json'));
  expect(files).toHaveLength(1);
  return parseAdventure(await readFile(join(dir, files[0] ?? ''), 'utf8'));
}

describe('Lorewarden MCP server', () => {
  it('builds an adventure step by step into a file the app can import', async () => {
    const { id, file } = await callJson('create_adventure', {
      title: 'Die stille Mühle',
      partySize: 4,
      partyLevel: 2,
      language: 'de',
    });
    expect(file).toBe('die-stille-muhle.adventure.json');

    const yard = (await callJson('upsert_scene', { adventureId: id, title: 'Mühlhof' })).id;
    const cellar = (
      await callJson('upsert_scene', {
        adventureId: id,
        title: 'Keller',
        description: 'Knietiefes Wasser.',
        ending: true,
      })
    ).id;
    await call('link_scenes', {
      adventureId: id,
      fromSceneId: yard,
      toSceneId: cellar,
      label: 'In die Mühle',
    });
    const npc = (
      await callJson('upsert_npc', {
        adventureId: id,
        name: 'Tamsin',
        voice: 'Hastig',
        sceneIds: [yard],
      })
    ).id;
    const wisp = (
      await callJson('upsert_pool_monster', { adventureId: id, name: 'Irrlicht', cr: 2 })
    ).id;
    const encounter = await callJson('upsert_encounter', {
      adventureId: id,
      sceneId: cellar,
      monsters: [{ poolMonsterId: wisp, count: 1 }],
      difficulty: 'moderate',
    });
    expect(encounter).toMatchObject({ xp: 450, rating: 'moderate' });
    await callJson('upsert_clue', {
      adventureId: id,
      text: 'Nur eine Spur führt zurück.',
      sceneIds: [yard, cellar],
    });

    const result = await readOnlyFile();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const adventure = result.adventure;
    expect(adventure.language).toBe('de');
    expect(adventure.startSceneId).toBe(yard);
    expect(adventure.scenes[0]).toMatchObject({
      npcIds: [npc],
      exits: [{ targetSceneId: cellar }],
    });
    expect(adventure.scenes[1]?.encounterIds).toEqual([encounter.id]);

    const findings = await call('check_adventure', { adventureId: id });
    expect(findings.body).toContain('"Mühlhof"');
    expect(findings.body).toContain('has no description');
    expect(findings.body).not.toContain('Error');
  });

  it('changes only the given fields', async () => {
    const { id } = await callJson('create_adventure', { title: 'A', partySize: 3, partyLevel: 1 });
    const scene = (
      await callJson('upsert_scene', { adventureId: id, title: 'Gate', notes: 'Secret' })
    ).id;
    await callJson('upsert_scene', { adventureId: id, id: scene, description: 'Rusty bars.' });
    const adventure = await callJson('get_adventure', { adventureId: id });
    expect(adventure.scenes[0]).toMatchObject({
      title: 'Gate',
      notes: 'Secret',
      description: 'Rusty bars.',
    });
  });

  it('rejects a change that breaks a reference and leaves the file as it was', async () => {
    const { id } = await callJson('create_adventure', { title: 'B', partySize: 3, partyLevel: 1 });
    const before = await readFile(join(dir, 'b.adventure.json'), 'utf8');
    const result = await call('upsert_scene', {
      adventureId: id,
      title: 'Hall',
      npcIds: ['npc-missing'],
    });
    expect(result.isError).toBe(true);
    expect(result.body).toContain('Unknown NPC "npc-missing"');
    expect(await readFile(join(dir, 'b.adventure.json'), 'utf8')).toBe(before);
  });

  it('will not remove a monster an encounter still uses', async () => {
    const { id } = await callJson('create_adventure', { title: 'C', partySize: 4, partyLevel: 1 });
    const goblin = (
      await callJson('upsert_pool_monster', { adventureId: id, name: 'Goblin', cr: 0.25 })
    ).id;
    await callJson('upsert_encounter', {
      adventureId: id,
      monsters: [{ poolMonsterId: goblin, count: 3 }],
    });
    const result = await call('remove_entry', { adventureId: id, kind: 'poolMonster', id: goblin });
    expect(result.isError).toBe(true);
  });

  it('reads adventures exported from the app and rates encounters for their party', async () => {
    await copyFile(
      new URL('../../../examples/lantern-in-the-marsh.adventure.json', import.meta.url),
      join(dir, 'lantern-in-the-marsh.adventure.json'),
    );
    const { adventures } = await callJson('list_adventures');
    expect(adventures).toHaveLength(1);
    const id = adventures[0].id;
    const adventure = await callJson('get_adventure', { adventureId: id });
    expect(adventure.scenes.length).toBeGreaterThan(0);

    const rating = await callJson('rate_encounter', {
      adventureId: id,
      monsters: [{ cr: 1, count: 1 }],
    });
    expect(rating.xp).toBe(200);
  });

  it('finds SRD monsters and uses them as stand-ins', async () => {
    const { id } = await callJson('create_adventure', { title: 'D', partySize: 4, partyLevel: 1 });
    const found = await callJson('search_monsters', { text: 'goblin', adventureId: id });
    expect(found.length).toBeGreaterThan(0);
    // Nothing above the high budget of 400 XP for four level 1 characters.
    const dragons = await callJson('search_monsters', { type: 'dragon', adventureId: id });
    for (const dragon of dragons) expect(dragon.xp).toBeLessThanOrEqual(400);

    const stand = await callJson('search_monsters', { type: 'undead', nearCr: 2, limit: 3 });
    expect(Math.abs(stand[0].cr - 2)).toBeLessThanOrEqual(Math.abs(stand[2].cr - 2));

    const block = await callJson('get_monster', { id: found[0].id });
    expect(block.actions.length).toBeGreaterThan(0);

    const pool = await callJson('upsert_pool_monster', {
      adventureId: id,
      baseMonsterRef: found[0].id,
      overrides: { name: 'Mudfoot' },
    });
    const adventure = await callJson('get_adventure', { adventureId: id });
    expect(adventure.monsterPool[0]).toMatchObject({
      id: pool.id,
      name: found[0].name,
      cr: found[0].cr,
      baseMonsterRef: found[0].id,
    });
  });

  it('offers a prompt that walks through building an adventure', async () => {
    const prompt = await client.getPrompt({
      name: 'new_adventure',
      arguments: { partySize: '5', partyLevel: '3', language: 'de', idea: 'Ein Leuchtturm' },
    });
    const message = prompt.messages[0]?.content;
    const body = message?.type === 'text' ? message.text : '';
    expect(body).toContain('5 characters of level 3');
    expect(body).toContain('German (de)');
    expect(body).toContain('create_adventure');
    expect(body).toContain('check_adventure');
    expect(body).toContain('search_monsters');
    expect(body).toContain('Build on everything I already have in mind');
    expect(body).toContain('Rules terms: English (en)');
    expect(body).toContain('"en" as termsLanguage');
  });

  it('writes rules terms in the adventure language when asked', async () => {
    const prompt = await client.getPrompt({
      name: 'new_adventure',
      arguments: { partySize: '4', partyLevel: '1', language: 'de', rulesTerms: 'same' },
    });
    const message = prompt.messages[0]?.content;
    const body = message?.type === 'text' ? message.text : '';
    expect(body).not.toContain('Rules terms');
    expect(body).not.toContain('termsLanguage');
  });
});

describe('newAdventurePrompt', () => {
  it('follows the languages chosen in the app', () => {
    const german = newAdventurePrompt(
      { partySize: '4', partyLevel: '1' },
      { language: 'de', termsLanguage: 'en' },
    );
    expect(german).toContain('German (de)');
    expect(german).toContain('Rules terms: English (en)');

    const allGerman = newAdventurePrompt({ partySize: '4', partyLevel: '1' }, { language: 'de' });
    expect(allGerman).toContain('German (de)');
    expect(allGerman).not.toContain('Rules terms');
  });
});

describe('what_now', () => {
  it('points the AI to the current scene', async () => {
    const prompt = await client.getPrompt({
      name: 'what_now',
      arguments: { situation: 'They set the mill on fire', scene: 'Mühlhof' },
    });
    const message = prompt.messages[0]?.content;
    const body = message?.type === 'text' ? message.text : '';
    expect(body).toContain('The party is in the scene "Mühlhof"');
    expect(body).toContain('They set the mill on fire');
  });
});

describe('slug', () => {
  it('makes file names from titles', () => {
    expect(slug('The Silent Mill!')).toBe('the-silent-mill');
    expect(slug('Straße der Rätsel')).toBe('strasse-der-ratsel');
  });
});
