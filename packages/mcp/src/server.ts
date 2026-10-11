import {
  ADVENTURE_LENGTHS,
  ADVENTURE_QUALITY_RULES,
  type Adventure,
  type AdventureLength,
  assessEncounter,
  BattleMap,
  budgetRule,
  ChallengeRating,
  CONTENT_RULES,
  describeLanguage,
  encounterBudget,
  QUEST_KINDS,
  SceneExit,
} from '@lorewarden/core';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  checkAdventure,
  ENTRY_KINDS,
  emptyAdventure,
  linkScenes,
  removeEntry,
  type Upserted,
  updateAdventure,
  upsertClue,
  upsertEncounter,
  upsertItem,
  upsertNpc,
  upsertPoolMonster,
  upsertScene,
  withoutImageData,
} from './edits';
import { AdventureError, type AdventureStore } from './store';

export const SERVER_INSTRUCTIONS = `Lorewarden is a game master tool for 5e-compatible tabletop RPGs. These tools read and write Lorewarden adventures, stored as files in a folder on this computer. The game master imports a file into the Lorewarden app to run it, and exports it from the app to work on it here.

An adventure has scenes linked by exits, NPCs, items, clues with the scenes where they can be found, a monster pool and encounters built from it. "description" fields are read aloud to the players; "notes" are secret for the game master.

Work in small steps and let the game master decide: suggest, then save what they agree to. Every change is checked before it is saved; if a tool reports an error, fix the input and call it again. Create entries before you reference them, e.g. scenes before exits that lead to them. Call check_adventure when a draft is complete and fix what it finds.

${CONTENT_RULES}`;

function text(value: unknown): CallToolResult {
  const body = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: 'text', text: body }] };
}

/** Runs a tool and turns a rejected change into a message the AI can act on. */
async function run(action: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await action();
  } catch (error) {
    if (!(error instanceof AdventureError)) throw error;
    return { isError: true, content: [{ type: 'text', text: error.message }] };
  }
}

const adventureId = z.string().describe('Id of the adventure, from list_adventures');
const id = (kind: string) =>
  z.string().optional().describe(`Id of the ${kind} to change. Leave it out to create a new one.`);
const ids = (kind: string) => z.array(z.string()).optional().describe(`Ids of ${kind}`);

export function createServer(store: AdventureStore, version = '0.0.0'): McpServer {
  const server = new McpServer(
    { name: 'lorewarden', title: 'Lorewarden', version },
    { instructions: SERVER_INSTRUCTIONS },
  );

  /** Saves a change made by an upsert and reports the id of the entry. */
  const save = (adventure: string, change: (adventure: Adventure) => Upserted) =>
    run(async () => {
      let saved = '';
      await store.update(adventure, (current) => {
        const result = change(current);
        saved = result.id;
        return result.adventure;
      });
      return text({ id: saved });
    });

  server.registerTool(
    'list_adventures',
    {
      title: 'List adventures',
      description: 'Lists the adventures in the Lorewarden folder with id, title and party.',
      annotations: { readOnlyHint: true },
    },
    () =>
      run(async () => {
        const { adventures, broken } = await store.list();
        return text({
          folder: store.dir,
          adventures: adventures.map(({ adventure, file }) => ({
            id: adventure.id,
            title: adventure.title,
            party: adventure.party,
            scenes: adventure.scenes.length,
            file,
          })),
          ...(broken.length > 0 ? { unreadableFiles: broken } : {}),
        });
      }),
  );

  server.registerTool(
    'get_adventure',
    {
      title: 'Read an adventure',
      description:
        'Returns a whole adventure as JSON: scenes, NPCs, items, clues, monster pool and encounters. Image data is left out.',
      inputSchema: { adventureId },
      annotations: { readOnlyHint: true },
    },
    ({ adventureId }) =>
      run(async () => text(withoutImageData((await store.get(adventureId)).adventure))),
  );

  server.registerTool(
    'create_adventure',
    {
      title: 'Create an adventure',
      description:
        'Creates a new, empty adventure file. The first scene you add becomes the start scene.',
      inputSchema: {
        title: z.string().min(1),
        summary: z
          .string()
          .optional()
          .describe('For the game master only: hook, antagonist, the truth behind it, the goal'),
        partySize: z.number().int().min(1).max(12),
        partyLevel: z.number().int().min(1).max(20),
        characters: z
          .string()
          .optional()
          .describe(
            'One short line per character: name, class, background, what the player enjoys',
          ),
        language: z.string().min(2).optional().describe('Language tag of the text, e.g. "de"'),
        termsLanguage: z
          .string()
          .min(2)
          .optional()
          .describe('Language tag of rules terms such as "DC", if it differs from the text'),
      },
    },
    (fields) =>
      run(async () => {
        const { adventure, file } = await store.add(emptyAdventure(fields));
        return text({ id: adventure.id, file });
      }),
  );

  server.registerTool(
    'update_adventure',
    {
      title: 'Change adventure details',
      description: 'Changes title, summary, party, language or start scene. Left-out fields stay.',
      inputSchema: {
        adventureId,
        title: z.string().min(1).optional(),
        summary: z.string().optional(),
        partySize: z.number().int().min(1).max(12).optional(),
        partyLevel: z.number().int().min(1).max(20).optional(),
        characters: z.string().optional(),
        language: z.string().min(2).optional(),
        termsLanguage: z.string().min(2).optional(),
        startSceneId: z.string().optional(),
      },
    },
    ({ adventureId, ...patch }) =>
      run(async () => {
        await store.update(adventureId, (adventure) => updateAdventure(adventure, patch));
        return text('Saved.');
      }),
  );

  server.registerTool(
    'upsert_scene',
    {
      title: 'Add or change a scene',
      description:
        'Creates a scene or changes the given fields of an existing one. Lists such as exits replace the old list. NPCs, items and encounters must exist first.',
      inputSchema: {
        adventureId,
        id: id('scene'),
        title: z.string().min(1).optional().describe('Short, evocative name of the location'),
        description: z.string().optional().describe('Read aloud to the players'),
        notes: z.string().optional().describe('Secret for the game master'),
        exits: z.array(SceneExit).optional().describe('Ways to other scenes'),
        npcIds: ids('NPCs in this scene'),
        itemIds: ids('items in this scene'),
        encounterIds: ids('encounters in this scene'),
        ending: z.boolean().optional().describe('The adventure can end here'),
        battleMap: BattleMap.optional().describe(
          'Grid of 5-foot squares; x and y count from the top left corner starting at 0, every feature lies inside the map',
        ),
        start: z.boolean().optional().describe('Make this the start scene'),
      },
    },
    ({ adventureId, ...patch }) => save(adventureId, (a) => upsertScene(a, patch)),
  );

  server.registerTool(
    'link_scenes',
    {
      title: 'Connect two scenes',
      description:
        'Adds an exit from one scene to another, or updates the exit with the same label.',
      inputSchema: {
        adventureId,
        fromSceneId: z.string(),
        toSceneId: z.string(),
        label: z.string().min(1).describe('What the players do, e.g. "Follow the tracks"'),
        condition: z.string().optional().describe('When this way is open, if not always'),
      },
    },
    ({ adventureId, ...link }) =>
      run(async () => {
        await store.update(adventureId, (adventure) => linkScenes(adventure, link));
        return text('Saved.');
      }),
  );

  const sceneIds = z
    .array(z.string())
    .optional()
    .describe('Scenes where it appears; replaces the old list');

  server.registerTool(
    'upsert_npc',
    {
      title: 'Add or change an NPC',
      description: 'Creates an NPC or changes the given fields of an existing one.',
      inputSchema: {
        adventureId,
        id: id('NPC'),
        name: z.string().min(1).optional(),
        role: z.string().optional(),
        description: z.string().optional().describe('What the players see'),
        voice: z
          .string()
          .optional()
          .describe('How to speak them at the table: pitch, pace, a quirk, a favourite phrase'),
        notes: z.string().optional().describe('What they want and know, for the game master'),
        tags: z.array(z.string()).optional(),
        sceneIds,
      },
    },
    ({ adventureId, ...patch }) => save(adventureId, (a) => upsertNpc(a, patch)),
  );

  server.registerTool(
    'upsert_item',
    {
      title: 'Add or change an item',
      description: 'Creates an item or reward, or changes the given fields of an existing one.',
      inputSchema: {
        adventureId,
        id: id('item'),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        rarity: z.string().optional(),
        notes: z.string().optional(),
        sceneIds,
      },
    },
    ({ adventureId, ...patch }) => save(adventureId, (a) => upsertItem(a, patch)),
  );

  server.registerTool(
    'upsert_clue',
    {
      title: 'Add or change a clue',
      description:
        'Creates a secret or clue the party can learn, or changes an existing one. List two or three scenes where it can be found.',
      inputSchema: {
        adventureId,
        id: id('clue'),
        text: z.string().min(1).optional().describe('What the party learns, in one sentence'),
        notes: z.string().optional(),
        sceneIds,
      },
    },
    ({ adventureId, ...patch }) => save(adventureId, (a) => upsertClue(a, patch)),
  );

  server.registerTool(
    'upsert_pool_monster',
    {
      title: 'Add or change a monster',
      description:
        "Adds a creature to the adventure's monster pool or changes one. Use SRD 5.2 creatures or invent your own; put attacks, hit points and armor class of invented creatures into overrides.",
      inputSchema: {
        adventureId,
        id: id('pool monster'),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        cr: ChallengeRating.optional().describe('0, 0.125, 0.25, 0.5 or a whole number 1 to 30'),
        count: z
          .object({ min: z.number().int().nonnegative(), max: z.number().int().nonnegative() })
          .optional()
          .describe('How many can appear in the adventure'),
        overrides: z
          .object({
            name: z.string().optional(),
            hp: z.number().int().positive().optional(),
            ac: z.number().int().nonnegative().optional(),
            damageType: z.string().optional(),
            attacks: z.string().optional(),
            notes: z.string().optional(),
          })
          .optional(),
        tags: z.array(z.string()).optional(),
      },
    },
    ({ adventureId, ...patch }) => save(adventureId, (a) => upsertPoolMonster(a, patch)),
  );

  server.registerTool(
    'upsert_encounter',
    {
      title: 'Add or change an encounter',
      description:
        'Creates a fight from pool monsters or changes one, and shows it in its scene. Returns how hard it is for the party.',
      inputSchema: {
        adventureId,
        id: id('encounter'),
        sceneId: z.string().optional(),
        monsters: z
          .array(z.object({ poolMonsterId: z.string(), count: z.number().int().positive() }))
          .optional(),
        difficulty: z.enum(['low', 'moderate', 'high']).optional(),
      },
    },
    ({ adventureId, ...patch }) =>
      run(async () => {
        let saved = '';
        const adventure = await store.update(adventureId, (current) => {
          const result = upsertEncounter(current, patch);
          saved = result.id;
          return result.adventure;
        });
        const encounter = adventure.encounters.find((e) => e.id === saved);
        const rating = encounter && assessEncounter(adventure, encounter);
        return text({ id: saved, ...(rating ? { xp: rating.xp, rating: rating.rating } : {}) });
      }),
  );

  server.registerTool(
    'remove_entry',
    {
      title: 'Remove an entry',
      description:
        'Removes a scene, NPC, item, clue, encounter or pool monster and every reference to it.',
      inputSchema: { adventureId, kind: z.enum(ENTRY_KINDS), id: z.string() },
      annotations: { destructiveHint: true },
    },
    ({ adventureId, kind, id }) =>
      run(async () => {
        await store.update(adventureId, (adventure) => removeEntry(adventure, kind, id));
        return text('Removed.');
      }),
  );

  server.registerTool(
    'rate_encounter',
    {
      title: 'Rate an encounter',
      description:
        "Rates monsters by the SRD 5.2 XP budget for the adventure's party: low, moderate, high or beyond.",
      inputSchema: {
        adventureId,
        monsters: z
          .array(z.object({ cr: ChallengeRating, count: z.number().int().positive() }))
          .min(1),
      },
      annotations: { readOnlyHint: true },
    },
    ({ adventureId, monsters }) =>
      run(async () => {
        const { adventure } = await store.get(adventureId);
        const pool = monsters.map((m, i) => ({
          id: `m${i}`,
          name: `m${i}`,
          description: '',
          cr: m.cr,
          count: { min: m.count, max: m.count },
          overrides: {},
          tags: [],
        }));
        const assessment = assessEncounter(
          { ...adventure, ruleset: 'srd-5.2', monsterPool: pool },
          {
            id: 'rating',
            monsters: monsters.map((m, i) => ({ poolMonsterId: `m${i}`, count: m.count })),
          },
        );
        return text({
          xp: assessment?.xp ?? 0,
          rating: assessment?.rating ?? 'low',
          budget: encounterBudget(adventure.party),
        });
      }),
  );

  server.registerTool(
    'check_adventure',
    {
      title: 'Check an adventure',
      description:
        'Finds broken references and weak spots: unreachable scenes, dead ends, clues found in only one place, unused NPCs and items, encounters that do not fit the party.',
      inputSchema: { adventureId },
      annotations: { readOnlyHint: true },
    },
    ({ adventureId }) =>
      run(async () => {
        const findings = checkAdventure((await store.get(adventureId)).adventure);
        return text(findings.length > 0 ? findings.join('\n') : 'No problems found.');
      }),
  );

  server.registerPrompt(
    'new_adventure',
    {
      title: 'New adventure',
      description: 'Builds a short adventure with you step by step and saves it for Lorewarden.',
      argsSchema: {
        idea: z.string().optional().describe('Your idea in a few words; empty for a surprise'),
        partySize: z.string().describe('Number of characters, e.g. 4'),
        partyLevel: z.string().describe('Character level, e.g. 3'),
        length: z.string().optional().describe('"one-shot" (default) or "two-evenings"'),
        language: z.string().optional().describe('Language of the adventure text, e.g. de or en'),
      },
    },
    (args) => ({
      messages: [{ role: 'user', content: { type: 'text', text: newAdventurePrompt(args) } }],
    }),
  );

  server.registerPrompt(
    'what_now',
    {
      title: 'What now?',
      description: 'The players did something unexpected: get three ways to react.',
      argsSchema: {
        situation: z.string().describe('What just happened at the table'),
        adventure: z.string().optional().describe('Title or id of the adventure'),
      },
    },
    ({ situation, adventure }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `I am running ${adventure ? `the Lorewarden adventure "${adventure}"` : 'a Lorewarden adventure'} right now. Find it with list_adventures and read it with get_adventure.

This just happened at the table: ${situation}

Give me three short ways to react that fit the story, its secrets and its NPCs, each in two or three sentences I can use right away. If one needs a new name, NPC or location, invent it. Do not change the adventure unless I ask you to.`,
          },
        },
      ],
    }),
  );

  return server;
}

function number(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, min), max) : fallback;
}

/** Instructions that guide the AI through building an adventure in stages, saving as it goes. */
export function newAdventurePrompt(args: {
  idea?: string | undefined;
  partySize: string;
  partyLevel: string;
  length?: string | undefined;
  language?: string | undefined;
}): string {
  const party = {
    size: number(args.partySize, 4, 1, 12),
    level: number(args.partyLevel, 1, 1, 20),
  };
  const length: AdventureLength = args.length === 'two-evenings' ? 'two-evenings' : 'one-shot';
  const language = args.language?.trim();
  const idea = args.idea?.trim() ?? '';
  return `You help me, a game master, write an adventure for a 5e-compatible tabletop RPG and save it with the Lorewarden tools.

## What I want

- Party: ${party.size} characters of level ${party.level}
- Length: ${ADVENTURE_LENGTHS[length]}
- Language of all adventure text: ${language ? describeLanguage(language) : 'the language I write in'}
- My idea: ${idea === '' ? 'none yet, surprise me' : idea}

## How we work

Work with me step by step and wait for my answer after each step. I decide, you suggest. Talk to me in the language I write in.

1. Ask me up to five short questions: who the characters are (class, background, what their players enjoy), then tone, setting, themes and anything my group does not want at the table. If I do not know the characters yet, carry on without them.
2. Pitch three short adventure ideas, each built on a different kind of quest: ${QUEST_KINDS}. I pick one or mix them.
3. Outline: the strong start, the goal, the antagonist and motive, the truth behind it, and six to ten secrets and clues. When I agree, call create_adventure with the outline as summary${language ? ` and "${language}" as language` : ''}.
4. Scenes: for each one the title, its location with three striking features, one line on what can happen there, and how the scenes connect. Offer more than one way forward where it makes sense. When I agree, save them with upsert_scene and link_scenes.
5. Details: write out every scene, then the NPCs, items and clues with upsert_npc, upsert_item and upsert_clue. Show me each scene briefly as you go.
6. Encounters: add creatures with upsert_pool_monster, then fights with upsert_encounter, and a battle map for each scene with a fight.
7. Check: call check_adventure, fix what it finds, and tell me the adventure is ready to import into Lorewarden.

I can skip or repeat any step, e.g. "make scene 4 darker" or "one more way out of the cellar". Change only what I ask for.

## What makes the adventure good

${ADVENTURE_QUALITY_RULES}

## Content rules

${CONTENT_RULES}
- ${budgetRule(party)}
`;
}
