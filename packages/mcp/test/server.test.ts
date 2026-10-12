import { copyFile, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createAdventure,
  createCharacter,
  createParty,
  parseAdventure,
  serializePartyLibrary,
  startSession,
} from '@lorewarden/core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  adaptAdventurePrompt,
  createServer,
  describeTable,
  newAdventurePrompt,
} from '../src/server';
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
    // Compact JSON saves the assistant's context.
    expect((await call('get_adventure', { adventureId: id })).body).not.toContain('\n');

    const yard = (await callJson('upsert_scene', { adventureId: id, title: 'Mühlhof' })).id;
    const cellar = (
      await callJson('upsert_scene', {
        adventureId: id,
        title: 'Keller',
        description: 'Knietiefes Wasser.',
        ending: true,
        levelUp: true,
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
    expect(adventure.scenes.map((scene) => scene.levelUp)).toEqual([false, true]);

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

  it('saves individual monsters of an encounter', async () => {
    const { id } = await callJson('create_adventure', { title: 'G', partySize: 4, partyLevel: 1 });
    const goblin = (
      await callJson('upsert_pool_monster', {
        adventureId: id,
        name: 'Goblin',
        cr: 0.25,
        baseMonsterRef: 'srd-goblin-warrior',
      })
    ).id;
    const encounter = await callJson('upsert_encounter', {
      adventureId: id,
      monsters: [
        { poolMonsterId: goblin, name: 'Goblin leader', description: 'Scarred, burly', hp: 12 },
        { poolMonsterId: goblin, count: 3 },
      ],
    });
    expect(encounter).toMatchObject({ xp: 200 });
    const adventure = await callJson('get_adventure', { adventureId: id });
    expect(adventure.encounters[0].monsters).toEqual([
      {
        poolMonsterId: goblin,
        count: 1,
        name: 'Goblin leader',
        description: 'Scarred, burly',
        hp: 12,
      },
      { poolMonsterId: goblin, count: 3 },
    ]);
  });

  it('takes the challenge rating from a new stat block', async () => {
    const { id } = await callJson('create_adventure', { title: 'G', partySize: 4, partyLevel: 1 });
    const plain = (
      await callJson('upsert_pool_monster', {
        adventureId: id,
        baseMonsterRef: 'srd-goblin-warrior',
      })
    ).id;
    const named = (
      await callJson('upsert_pool_monster', {
        adventureId: id,
        name: 'Bog Brute',
        baseMonsterRef: 'srd-goblin-warrior',
      })
    ).id;
    for (const poolId of [plain, named]) {
      await callJson('upsert_pool_monster', {
        adventureId: id,
        id: poolId,
        baseMonsterRef: 'srd-ogre',
      });
    }
    const { monsterPool } = await callJson('get_adventure', { adventureId: id });
    expect(monsterPool.map((m: { name: string; cr: number }) => [m.name, m.cr])).toEqual([
      ['Ogre', 2],
      ['Bog Brute', 2],
    ]);
  });

  it('changes overrides one by one', async () => {
    const { id } = await callJson('create_adventure', { title: 'G', partySize: 4, partyLevel: 1 });
    const pool = (
      await callJson('upsert_pool_monster', {
        adventureId: id,
        baseMonsterRef: 'srd-ogre',
        overrides: { hp: 30, notes: 'x' },
      })
    ).id;
    await callJson('upsert_pool_monster', { adventureId: id, id: pool, overrides: { ac: 16 } });
    let adventure = await callJson('get_adventure', { adventureId: id });
    expect(adventure.monsterPool[0].overrides).toEqual({ hp: 30, notes: 'x', ac: 16 });
    await callJson('upsert_pool_monster', {
      adventureId: id,
      id: pool,
      overrides: { notes: null },
    });
    adventure = await callJson('get_adventure', { adventureId: id });
    expect(adventure.monsterPool[0].overrides).toEqual({ hp: 30, ac: 16 });
  });

  it('clears optional fields set to null', async () => {
    const { id } = await callJson('create_adventure', { title: 'G', partySize: 4, partyLevel: 1 });
    const scene = (await callJson('upsert_scene', { adventureId: id, title: 'Gate' })).id;
    const pool = (
      await callJson('upsert_pool_monster', { adventureId: id, baseMonsterRef: 'srd-ogre' })
    ).id;
    const npc = (
      await callJson('upsert_npc', {
        adventureId: id,
        name: 'Grub',
        role: 'Guard',
        poolMonsterId: pool,
      })
    ).id;
    const item = (await callJson('upsert_item', { adventureId: id, name: 'Key', rarity: 'common' }))
      .id;
    const puzzle = (
      await callJson('upsert_puzzle', { adventureId: id, title: 'Lock', sceneId: scene })
    ).id;
    await callJson('upsert_npc', { adventureId: id, id: npc, role: null, poolMonsterId: null });
    await callJson('upsert_item', { adventureId: id, id: item, rarity: null });
    await callJson('upsert_puzzle', { adventureId: id, id: puzzle, sceneId: null });
    await callJson('upsert_pool_monster', { adventureId: id, id: pool, baseMonsterRef: null });
    const adventure = await callJson('get_adventure', { adventureId: id });
    expect(adventure.npcs[0]).not.toHaveProperty('poolMonsterId');
    expect(adventure.npcs[0]).not.toHaveProperty('role');
    expect(adventure.items[0]).not.toHaveProperty('rarity');
    expect(adventure.puzzles[0]).not.toHaveProperty('sceneId');
    expect(adventure.monsterPool[0]).not.toHaveProperty('baseMonsterRef');
    expect(
      (await call('remove_entry', { adventureId: id, kind: 'poolMonster', id: pool })).isError,
    ).toBe(false);
  });

  it('saves mechanics and objects of an encounter', async () => {
    const { id } = await callJson('create_adventure', { title: 'B', partySize: 4, partyLevel: 5 });
    const ogre = (
      await callJson('upsert_pool_monster', {
        adventureId: id,
        name: 'Ogre',
        cr: 2,
        baseMonsterRef: 'srd-ogre',
      })
    ).id;
    const { id: encounter } = await callJson('upsert_encounter', {
      adventureId: id,
      monsters: [{ poolMonsterId: ogre }],
      objects: [{ name: 'Crystal', ac: 13, hp: 10 }],
      mechanics: [
        { trigger: 'round', round: 3, text: 'The ritual is complete.' },
        { trigger: 'bloodied', target: ogre, text: 'The ogre calls for help.' },
      ],
    });
    const adventure = await callJson('get_adventure', { adventureId: id });
    const saved = adventure.encounters.find((e: { id: string }) => e.id === encounter);
    expect(saved.objects[0]).toMatchObject({ name: 'Crystal', ac: 13, hp: 10 });
    expect(saved.objects[0].id).toMatch(/^obj-/);
    expect(saved.mechanics.map((m: { id: string }) => m.id.slice(0, 5))).toEqual([
      'mech-',
      'mech-',
    ]);

    const broken = await call('upsert_encounter', {
      adventureId: id,
      id: encounter,
      mechanics: [{ trigger: 'defeated', target: 'pool-nobody', text: 'Nothing.' }],
    });
    expect(broken.isError).toBe(true);
    expect(broken.body).toContain('mechanics[0].target');
  });

  it('saves a scene at a glance and refuses more than three features', async () => {
    const { id } = await callJson('create_adventure', { title: 'G', partySize: 4, partyLevel: 3 });
    const scene = (
      await callJson('upsert_scene', {
        adventureId: id,
        title: 'Gate',
        purpose: 'The party learns the guard is bribed.',
        features: ['Rusty bars', 'Smoking brazier', 'Crow cages'],
        wayOut: 'Through the gate once the guard looks away.',
      })
    ).id;
    const adventure = await callJson('get_adventure', { adventureId: id });
    expect(adventure.scenes[0]).toMatchObject({
      purpose: 'The party learns the guard is bribed.',
      features: ['Rusty bars', 'Smoking brazier', 'Crow cages'],
      wayOut: 'Through the gate once the guard looks away.',
    });
    const tooMany = await call('upsert_scene', {
      adventureId: id,
      id: scene,
      features: ['a', 'b', 'c', 'd'],
    });
    expect(tooMany.isError).toBe(true);
  });

  it('saves puzzles with hints and a drawing', async () => {
    const { id } = await callJson('create_adventure', { title: 'P', partySize: 4, partyLevel: 3 });
    const vault = (await callJson('upsert_scene', { adventureId: id, title: 'Vault' })).id;
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle r="4"/></svg>';
    const puzzle = (
      await callJson('upsert_puzzle', {
        adventureId: id,
        title: 'Rune Lock',
        sceneId: vault,
        prompt: 'Five runes around a keyhole.',
        solution: 'Press the rune of the moon.',
        hints: ['Look at the sky.', 'It is night.'],
        svg,
      })
    ).id;
    let adventure = await callJson('get_adventure', { adventureId: id });
    const [saved] = adventure.puzzles;
    expect(saved).toMatchObject({ id: puzzle, sceneId: vault, title: 'Rune Lock' });
    expect(adventure.assets).toEqual([{ id: saved.assetId, kind: 'handout', title: 'Rune Lock' }]);
    const firstHint = saved.hints[0].id;

    // New hints keep the ids of the old ones at the same place, so reveals stay valid.
    await callJson('upsert_puzzle', {
      adventureId: id,
      id: puzzle,
      hints: ['Look up.', 'It is night.', 'The moon.'],
      svg,
    });
    adventure = await callJson('get_adventure', { adventureId: id });
    expect(adventure.puzzles[0].hints.map((h: { text: string }) => h.text)).toEqual([
      'Look up.',
      'It is night.',
      'The moon.',
    ]);
    expect(adventure.puzzles[0].hints[0].id).toBe(firstHint);
    expect(adventure.assets).toHaveLength(1);

    const result = await readOnlyFile();
    expect(result.ok && result.adventure.assets[0]?.src).toMatch(/^data:image\/svg\+xml;base64,/);

    const bad = await call('upsert_puzzle', {
      adventureId: id,
      id: puzzle,
      svg: '<svg onload="alert(1)"></svg>',
    });
    expect(bad).toMatchObject({ isError: true });
    expect(bad.body).toContain('must not contain scripts');
    expect((await call('upsert_puzzle', { adventureId: id, svg: '<svg></svg>' })).body).toContain(
      'needs a title',
    );

    await call('remove_entry', { adventureId: id, kind: 'puzzle', id: puzzle });
    adventure = await callJson('get_adventure', { adventureId: id });
    expect(adventure.puzzles).toEqual([]);
    expect(adventure.assets).toEqual([]);
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

  it('writes stat blocks for invented monsters and keeps them in the library', async () => {
    const { id } = await callJson('create_adventure', { title: 'E', partySize: 4, partyLevel: 2 });
    const statBlock = {
      name: 'Bog Imp',
      size: 'small',
      type: 'fiend',
      alignment: 'chaotic evil',
      cr: 0.5,
      ac: 13,
      hp: 18,
      hitDice: '4d6 + 4',
      abilities: { str: 8, dex: 16, con: 12, int: 10, wis: 10, cha: 14 },
      saves: { dex: 5 },
      senses: 'Darkvision 60 ft.; Passive Perception 10',
      languages: 'Infernal',
      actions: [
        { name: 'Claw', text: 'Melee Attack Roll: +5, reach 5 ft. 6 (1d6 + 3) Slashing damage.' },
      ],
    };
    const own = await callJson('upsert_monster', { adventureId: id, ...statBlock });
    expect(own.id).toMatch(/^monster-/);
    const pool = await callJson('upsert_pool_monster', { adventureId: id, baseMonsterRef: own.id });
    const adventure = await callJson('get_adventure', { adventureId: id });
    expect(adventure.monsterPool[0]).toMatchObject({ id: pool.id, name: 'Bog Imp', cr: 0.5 });
    const block = await callJson('get_monster', { id: own.id, adventureId: id });
    expect(block).toMatchObject({ initiative: 3, saves: { dex: 5, str: -1 } });
    const used = await call('remove_entry', { adventureId: id, kind: 'monster', id: own.id });
    expect(used.isError).toBe(true);

    // A monster of the library is copied into the adventure that uses it.
    const library = await callJson('upsert_monster', { ...statBlock, name: 'Fen Hag', cr: 2 });
    expect(library.savedIn).toBe('library');
    expect(await readFile(join(dir, 'monsters.json'), 'utf8')).toContain('Fen Hag');
    const found = await callJson('search_monsters', { text: 'fen hag' });
    expect(found[0]).toMatchObject({ id: library.id, source: 'own' });
    await callJson('upsert_pool_monster', { adventureId: id, baseMonsterRef: library.id });
    const result = await readOnlyFile();
    expect(result.ok && result.adventure.monsters.map((m) => m.name)).toEqual([
      'Bog Imp',
      'Fen Hag',
    ]);

    const broken = await call('upsert_monster', { ...statBlock, cr: 0.3 });
    expect(broken.isError).toBe(true);
  });

  it('suggests fights that fit the party', async () => {
    const { id } = await callJson('create_adventure', { title: 'F', partySize: 4, partyLevel: 3 });
    const fight = await callJson('suggest_encounter', {
      adventureId: id,
      difficulty: 'high',
      type: 'undead',
    });
    expect(fight.difficulty).toBe('high');
    expect(fight.xp).toBeLessThanOrEqual(1600);
    for (const monster of fight.monsters) expect(monster.type).toBe('undead');
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
    expect(body).toContain('The antagonist acts');
    expect(body).toContain('Read the draft as my players would');
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

describe('parties', () => {
  async function withParty() {
    const party = {
      ...createParty('Tuesday group'),
      characters: [
        { ...createCharacter('Mira', 3), className: 'Ranger' },
        { ...createCharacter('Thorn', 2), className: 'Cleric', notes: 'Hates the sea' },
      ],
    };
    await writeFile(join(dir, 'parties.json'), serializePartyLibrary([party]));
    return party;
  }

  it('lists the parties and links an adventure to one', async () => {
    const party = await withParty();
    const listed = await callJson('list_parties');
    expect(listed.parties[0].characters[1].notes).toBe('Hates the sea');
    const { id } = await callJson('create_adventure', {
      title: 'The Silent Mill',
      partySize: 4,
      partyLevel: 1,
    });
    await call('update_adventure', { adventureId: id, partyId: party.id });
    const saved = await callJson('get_adventure', { adventureId: id });
    expect(saved.party).toMatchObject({ size: 2, level: 3, levels: [3, 2], partyId: party.id });
    const unknown = await call('update_adventure', { adventureId: id, partyId: 'party-none' });
    expect(unknown.isError).toBe(true);
    await call('update_adventure', { adventureId: id, partySize: 5 });
    const resized = await callJson('get_adventure', { adventureId: id });
    expect(resized.party.partyId).toBeUndefined();
  });

  it('writes a new adventure for the characters of a party', async () => {
    const party = await withParty();
    const prompt = await client.getPrompt({
      name: 'new_adventure',
      arguments: { party: 'tuesday group' },
    });
    const message = prompt.messages[0]?.content;
    const body = message?.type === 'text' ? message.text : '';
    expect(body).toContain('Party: 2 characters of level 3 (levels 3, 2)');
    expect(body).toContain('  - Thorn: Cleric, level 2. Hates the sea');
    expect(body).toContain(`update_adventure with partyId "${party.id}"`);
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

  it("takes any length in the game master's own words", () => {
    const party = { partySize: '4', partyLevel: '3' };
    expect(newAdventurePrompt(party)).toContain('Length: a one-shot for a single evening');
    expect(newAdventurePrompt({ ...party, length: 'two-evenings' })).toContain(
      'Length: a short adventure for one or two evenings',
    );
    const free = newAdventurePrompt({ ...party, length: 'three evenings' });
    expect(free).toContain('Length: three evenings. Plan an evening as 3 to 4 hours');
    expect(free).toContain('scale the scenes, fights and clues to the number of evenings');
  });

  it('does not take numbers from a party without characters', () => {
    const empty = createParty('New group');
    expect(newAdventurePrompt({}, undefined, empty)).toContain('Party: 4 characters of level 1');
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

describe('describeTable', () => {
  it('lists the clues still open elsewhere and all NPCs, to improvise with', async () => {
    const example = new URL(
      '../../../examples/lantern-in-the-marsh.adventure.json',
      import.meta.url,
    );
    const parsed = parseAdventure(await readFile(example, 'utf8'));
    if (!parsed.ok) throw new Error('The example adventure does not load.');
    const { adventure } = parsed;
    const session = { ...startSession(adventure), currentSceneId: 'scene-island' };
    const table = describeTable({ adventure, session });
    const here = table.currentScene?.clues.map((clue) => clue.id) ?? [];
    expect(table.openClues.length).toBeGreaterThan(0);
    for (const clue of table.openClues) expect(here).not.toContain(clue.id);
    expect(table.openClues.flatMap((clue) => clue.leads.map((lead) => lead.where))).toContain(
      'Old Brannoc',
    );
    expect(table.npcs.map((npc) => npc.name)).toHaveLength(adventure.npcs.length);
    expect(table.npcs.find((npc) => npc.id === 'npc-iselde')?.inScene).toBe(true);
  });
});

describe('adapt_adventure', () => {
  it('saves the new party and changes the adventure step by step', async () => {
    const prompt = await client.getPrompt({
      name: 'adapt_adventure',
      arguments: { adventure: 'Lantern in the Marsh', partySize: '5', partyLevel: '3' },
    });
    const message = prompt.messages[0]?.content;
    const body = message?.type === 'text' ? message.text : '';
    expect(body).toContain('Adventure: "Lantern in the Marsh"');
    expect(body).toContain('Party: 5 characters of level 3');
    expect(body).toContain('Save partySize 5 and partyLevel 3 with update_adventure');
    expect(body).toContain('rate_encounter');
    expect(body).toContain('wait for my answer');
    expect(body).toContain('never rewrite the whole adventure');
    expect(body).toContain('check_adventure');
    expect(body).toContain('give every character one moment');
  });

  it('keeps the saved party and works in the characters it is given', () => {
    const body = adaptAdventurePrompt({
      adventure: 'adv-marsh',
      characters: 'Mira, ranger, grew up on the marsh',
    });
    expect(body).toContain('Party: as saved in the adventure');
    expect(body).toContain('Mira, ranger, grew up on the marsh');
    expect(body).toContain('Save my notes as "characters" with update_adventure');
    expect(adaptAdventurePrompt({ adventure: 'adv-marsh' })).toContain('1. Rate every encounter');
  });

  it('fits the adventure to one of the parties', () => {
    const party = { ...createParty('Tuesday group'), characters: [createCharacter('Mira', 3)] };
    const body = adaptAdventurePrompt({ adventure: 'adv-marsh', party: 'tuesday group' }, party);
    expect(body).toContain(`update_adventure partyId "${party.id}"`);
    expect(body).toContain('- Mira: level 3');
    expect(body).not.toContain('Save my notes as "characters"');
  });
});

describe('slug', () => {
  it('makes file names from titles', () => {
    expect(slug('The Silent Mill!')).toBe('the-silent-mill');
    expect(slug('Straße der Rätsel')).toBe('strasse-der-ratsel');
  });
});

describe('AdventureStore', () => {
  it('keeps every change when tools run at the same time', async () => {
    const store = new AdventureStore(dir);
    const { adventure } = await store.add(
      createAdventure({ title: 'Mill', partySize: 4, partyLevel: 1 }),
    );
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        store.update(adventure.id, (current) => ({
          ...current,
          summary: `${current.summary}${i}`,
        })),
      ),
    );
    const { adventure: saved } = await store.get(adventure.id);
    expect([...saved.summary].sort().join('')).toBe('01234567');
    expect((await readdir(dir)).filter((file) => file.endsWith('.tmp'))).toEqual([]);
  });
});
