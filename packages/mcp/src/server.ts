import {
  ADAPT_CHARACTERS_RULE,
  ADAPT_ENCOUNTERS_RULE,
  ADAPT_KEEP_RULE,
  ADAPT_KEEP_WITH_CHARACTERS_RULE,
  ADAPT_NOTES_RULE,
  ADAPT_REWARDS_RULE,
  ADAPT_STRENGTHS_RULE,
  type Adventure,
  type AiSettings,
  AT_A_GLANCE_RULE,
  adventureQualityRules,
  assessEncounter,
  BattleMap,
  budgetRule,
  ChallengeRating,
  clueSceneIds,
  cluesInScene,
  contentRules,
  createId,
  DIALS_RULE,
  describeCharacters,
  describeLanguage,
  describeLength,
  describePartySize,
  ENCOUNTER_DIFFICULTIES,
  encounterBudget,
  findMonster,
  followParty,
  generateEncounter,
  INDIVIDUALS_RULE,
  LINK_RULE,
  leadPlace,
  MECHANICS_RULE,
  MechanicTrigger,
  Monster,
  monsterStatBlock,
  NOTES_RULE,
  OUTLINE_STEP,
  openClues,
  type Party,
  PITCH_STEP,
  partyNumbers,
  partyOf,
  partyWithoutPhones,
  QUESTIONS_STEP,
  READ_ALOUD_RULE,
  resolvePoolMonster,
  SceneExit,
  SELF_REVIEW,
  STAT_BLOCK_RULE,
  SUMMARY_CONTENT,
  srdMonsters,
  termsRule,
} from '@lorewarden/core';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { TableState } from './api';
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
  upsertMonster,
  upsertNpc,
  upsertPoolMonster,
  upsertPuzzle,
  upsertScene,
  withoutImageData,
} from './edits';
import { monsterSummary, searchMonsters } from './monsters';
import { AdventureError, type Adventures } from './store';

export const SERVER_INSTRUCTIONS = `Lorewarden is a game master tool for 5e-compatible tabletop RPGs. These tools read and write the adventures kept by Lorewarden, the same ones the game master sees in the Lorewarden app; every change appears there right away. get_table_state shows what is happening at the table while the game master plays in live mode. While Lorewarden is not running, the tools work on the adventure files in its folder.

An adventure has a party (size and level, and partyId when it is played with one of the game master's parties from list_parties, whose characters you can name in hooks, rewards and spotlight moments), scenes linked by exits, NPCs, items, clues with the scenes where they can be found, puzzles with hints the game master can show on the players' phones, a monster pool and encounters built from it. "description" fields are read aloud to the players; "notes" are secret for the game master. ${NOTES_RULE} ${LINK_RULE} When the game master asks for links in an existing adventure, add them with the upsert tools.

Work in small steps and let the game master decide: suggest, then save what they agree to. Every change is checked before it is saved; if a tool reports an error, fix the input and call it again. Create entries before you reference them, e.g. scenes before exits that lead to them. Call check_adventure when a draft is complete and fix what it finds.

${contentRules('found with search_monsters')}`;

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

export interface ServerOptions {
  version?: string;
  /** What is happening at the table, if an adventure is being played. */
  tableState?: () => Promise<TableState | undefined>;
  /** Languages for new adventures chosen in the app. */
  appSettings?: () => Promise<AiSettings | undefined>;
}

export function createServer(store: Adventures, options: ServerOptions = {}): McpServer {
  const {
    version = '0.0.0',
    tableState = async () => undefined,
    appSettings = async () => undefined,
  } = options;
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
          location: store.location,
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
        'Returns a whole adventure as JSON: scenes, NPCs, items, clues, puzzles, monster pool and encounters. Image data is left out.',
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
        summary: z.string().optional().describe(`For the game master only: ${SUMMARY_CONTENT}`),
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
        // Without languages of its own, a new adventure follows the app's settings.
        const languages =
          fields.language || fields.termsLanguage ? {} : ((await appSettings()) ?? {});
        const { adventure, file } = await store.add(emptyAdventure({ ...languages, ...fields }));
        return text({ id: adventure.id, file });
      }),
  );

  server.registerTool(
    'update_adventure',
    {
      title: 'Change adventure details',
      description:
        "Changes title, summary, party, language or start scene. Left-out fields stay. A new party size or level ends the link to the game master's party.",
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
        partyId: z
          .string()
          .optional()
          .describe(
            'Plays the adventure with this party from list_parties; size and level follow its characters',
          ),
      },
    },
    ({ adventureId, partyId, ...patch }) =>
      run(async () => {
        const party = partyId ? (await store.parties()).find((p) => p.id === partyId) : undefined;
        if (partyId && !party) {
          throw new AdventureError(`No party with id "${partyId}". Call list_parties to see them.`);
        }
        await store.update(adventureId, (adventure) => {
          const changed = updateAdventure(adventure, patch);
          return party ? followParty(changed, party) : changed;
        });
        return text('Saved.');
      }),
  );

  server.registerTool(
    'upsert_scene',
    {
      title: 'Add or change a scene',
      description:
        'Creates a scene or changes the given fields of an existing one. Lists such as exits replace the old list. NPCs, items and encounters must exist first. battleMap null removes the map.',
      inputSchema: {
        adventureId,
        id: id('scene'),
        title: z.string().min(1).optional().describe('Short, evocative name of the location'),
        purpose: z.string().optional().describe('One sentence on what the scene is for'),
        features: z
          .array(z.string().min(1))
          .max(3)
          .optional()
          .describe('Three short, evocative features of the location the characters can use'),
        wayOut: z.string().optional().describe('How the scene usually ends or where it leads'),
        description: z
          .string()
          .optional()
          .describe('Read aloud to the players, two or three sentences'),
        notes: z.string().optional().describe('Secret for the game master, as bullet points'),
        exits: z.array(SceneExit).optional().describe('Ways to other scenes'),
        npcIds: ids('NPCs in this scene'),
        itemIds: ids('items in this scene'),
        encounterIds: ids('encounters in this scene'),
        ending: z.boolean().optional().describe('The adventure can end here'),
        levelUp: z
          .boolean()
          .optional()
          .describe('The party gains a level after this scene, usually the climax'),
        battleMap: BattleMap.nullable()
          .optional()
          .describe(
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
      description:
        'Creates an NPC or changes the given fields of an existing one. Set role or poolMonsterId to null to clear it.',
      inputSchema: {
        adventureId,
        id: id('NPC'),
        name: z.string().min(1).optional(),
        role: z.string().nullable().optional(),
        description: z.string().optional().describe('What the players see'),
        voice: z
          .string()
          .optional()
          .describe('How to speak them at the table: pitch, pace, a quirk, a favourite phrase'),
        notes: z.string().optional().describe('What they want and know, for the game master'),
        tags: z.array(z.string()).optional(),
        poolMonsterId: z
          .string()
          .nullable()
          .optional()
          .describe(
            'For an NPC who may fight: the pool monster with their stat block, under the same name. null unlinks it.',
          ),
        sceneIds,
      },
    },
    ({ adventureId, ...patch }) => save(adventureId, (a) => upsertNpc(a, patch)),
  );

  server.registerTool(
    'upsert_item',
    {
      title: 'Add or change an item',
      description:
        'Creates an item or reward, or changes the given fields of an existing one. Set rarity to null to clear it.',
      inputSchema: {
        adventureId,
        id: id('item'),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        rarity: z.string().nullable().optional(),
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
        'Creates a secret or clue the party can learn, or changes an existing one. A clue is one truth, written as a reminder for the game master, not as text for the players. Put two or three ways to find it into leads, each tied to the scene where it turns up or the NPC who knows it, so the game master reads only the ways that fit the scene. The clue can be found in its scenes and wherever its leads turn up; spread them over two or three scenes.',
      inputSchema: {
        adventureId,
        id: id('clue'),
        text: z
          .string()
          .min(1)
          .optional()
          .describe('The one truth the party learns, in one sentence'),
        notes: z.string().optional().describe('Anything else the game master should know'),
        sceneIds: z
          .array(z.string())
          .optional()
          .describe(
            'Scenes where it can be found besides those of its leads; replaces the old list',
          ),
        leads: z
          .array(
            z.object({
              text: z
                .string()
                .min(1)
                .describe('One way to find it, starting with its kind, e.g. "Witness: ..."'),
              sceneId: z.string().optional().describe('Scene where this trace or object turns up'),
              npcId: z.string().optional().describe('NPC who knows it, wherever they appear'),
            }),
          )
          .optional()
          .describe('Two or three ways the party could find it; replaces the old list'),
      },
    },
    ({ adventureId, ...patch }) => save(adventureId, (a) => upsertClue(a, patch)),
  );

  server.registerTool(
    'upsert_puzzle',
    {
      title: 'Add or change a puzzle',
      description:
        "Creates a riddle, lock or other puzzle in a scene, or changes an existing one. The game master can show the prompt, the drawing and each hint on the players' phones.",
      inputSchema: {
        adventureId,
        id: id('puzzle'),
        title: z.string().min(1).optional(),
        sceneId: z
          .string()
          .nullable()
          .optional()
          .describe('Scene where the party meets the puzzle; null for none'),
        prompt: z
          .string()
          .optional()
          .describe('What the players see: the riddle, inscription or mechanism itself'),
        solution: z.string().optional(),
        hints: z
          .array(z.string().min(1))
          .optional()
          .describe(
            'Two or three hints, from a gentle nudge to almost the answer. Replaces the old hints.',
          ),
        notes: z
          .string()
          .optional()
          .describe(
            'For the game master: what happens on a wrong answer and if the party gives up',
          ),
        svg: z
          .string()
          .optional()
          .describe(
            'A drawing of the puzzle as SVG markup with a viewBox, e.g. a lock, a symbol circle or a tile grid, shown with the prompt. Plain shapes and text only: no scripts, no links to other files. Leave it out to keep the current drawing.',
          ),
      },
    },
    ({ adventureId, ...patch }) => save(adventureId, (a) => upsertPuzzle(a, patch)),
  );

  server.registerTool(
    'upsert_pool_monster',
    {
      title: 'Add or change a monster',
      description:
        "Adds a creature to the adventure's monster pool or changes one. Set baseMonsterRef to a monster found with search_monsters, so the game master has the full stat block. For a creature nothing fits, write its stat block with upsert_monster first. A new baseMonsterRef brings its challenge rating, and its name unless the creature has its own. Set baseMonsterRef to null to remove it.",
      inputSchema: {
        adventureId,
        id: id('pool monster'),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        cr: ChallengeRating.optional().describe(
          '0, 0.125, 0.25, 0.5 or a whole number 1 to 30; taken from baseMonsterRef if left out',
        ),
        baseMonsterRef: z
          .string()
          .nullable()
          .optional()
          .describe(
            'Id of a monster from search_monsters, e.g. "srd-goblin-warrior", or of a stat block saved with upsert_monster: its stat block is used at the table. For a variant, the closest creature as stand-in, with the differences in overrides.',
          ),
        count: z
          .object({ min: z.number().int().nonnegative(), max: z.number().int().nonnegative() })
          .optional()
          .describe('How many can appear in the adventure'),
        overrides: z
          .object({
            name: z.string().nullable().optional(),
            hp: z.number().int().positive().nullable().optional(),
            ac: z.number().int().nonnegative().nullable().optional(),
            damageType: z.string().nullable().optional(),
            attacks: z.string().nullable().optional(),
            notes: z.string().nullable().optional(),
          })
          .optional()
          .describe('Changes the given overrides and keeps the others; null clears one'),
        tags: z.array(z.string()).optional(),
      },
    },
    ({ adventureId, ...patch }) =>
      run(async () => {
        const library = await store.monsters();
        return save(adventureId, (a) => upsertPoolMonster(a, patch, library));
      }),
  );

  const { id: _id, source: _source, ...statBlockFields } = Monster.shape;
  server.registerTool(
    'upsert_monster',
    {
      title: 'Write a stat block',
      description:
        "Saves the full stat block of a creature you invent, built like the SRD stat blocks from get_monster. With adventureId it is saved in that adventure; then add it to the monster pool with upsert_pool_monster and its id as baseMonsterRef. Without adventureId it goes into the game master's own monster library, which every adventure can use. Send the whole stat block; it replaces an existing one with the same id.",
      inputSchema: {
        adventureId: adventureId
          .optional()
          .describe("Leave it out to save the monster in the game master's library"),
        id: z
          .string()
          .optional()
          .describe('Id of the stat block to replace. Leave it out to create a new one.'),
        ...statBlockFields,
        saves: statBlockFields.saves.describe(
          'Only saving throws that differ from the ability modifier, e.g. {"dex": 5}',
        ),
      },
    },
    ({ adventureId, id, ...fields }) =>
      run(async () => {
        const parsed = Monster.safeParse({
          ...fields,
          id: id ?? createId('monster'),
          source: { kind: 'custom' },
        });
        if (!parsed.success) {
          const problems = parsed.error.issues.map(
            (i) => `${i.path.map(String).join('.')}: ${i.message}`,
          );
          throw new AdventureError(`The stat block was not saved:\n${problems.join('\n')}`);
        }
        if (adventureId) return save(adventureId, (a) => upsertMonster(a, parsed.data));
        await store.saveMonster(parsed.data);
        return text({ id: parsed.data.id, savedIn: 'library' });
      }),
  );

  server.registerTool(
    'search_monsters',
    {
      title: 'Search monsters',
      description:
        'Searches the monsters Lorewarden has full stat blocks for: the game master\'s own monsters and those of the adventure (source "own"), then the SRD 5.2.1, by name, type, size and challenge rating. With nearCr it finds stand-ins for a creature of the story. With adventureId it leaves out monsters too strong for its party.',
      inputSchema: {
        text: z.string().optional().describe('Part of the name or type, e.g. "wolf"'),
        type: z.string().optional().describe('e.g. "undead", "beast", "fiend"'),
        size: z.enum(['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan']).optional(),
        minCr: z.number().optional(),
        maxCr: z.number().optional(),
        nearCr: z.number().optional().describe('Sort by closeness to this challenge rating'),
        adventureId: adventureId.optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    ({ adventureId, ...query }) =>
      run(async () => {
        const adventure = adventureId ? (await store.get(adventureId)).adventure : undefined;
        const library = await store.monsters();
        const ownIds = new Set(adventure?.monsters.map((m) => m.id));
        const own = [...(adventure?.monsters ?? []), ...library.filter((m) => !ownIds.has(m.id))];
        const found = searchMonsters(
          { ...query, party: adventure?.party },
          own.map(monsterStatBlock),
        ).map(monsterSummary);
        return text(found.length > 0 ? found : 'No monsters found. Try fewer filters.');
      }),
  );

  server.registerTool(
    'get_monster',
    {
      title: 'Read a stat block',
      description:
        "Returns the full stat block of a monster from search_monsters: an SRD 5.2.1 monster, one of the game master's own or one of the adventure.",
      inputSchema: {
        id: z.string().describe('e.g. "srd-goblin-warrior"'),
        adventureId: adventureId.optional().describe('Needed for a stat block of an adventure'),
      },
      annotations: { readOnlyHint: true },
    },
    ({ id, adventureId }) =>
      run(async () => {
        const adventure = adventureId ? (await store.get(adventureId)).adventure : undefined;
        const monster = findMonster(adventure, await store.monsters(), id);
        if (!monster) throw new AdventureError(`No monster with id "${id}".`);
        return text(monster);
      }),
  );

  server.registerTool(
    'upsert_encounter',
    {
      title: 'Add or change an encounter',
      description:
        'Creates a fight from pool monsters or changes one, and shows it in its scene. Returns how hard it is for the party. Set sceneId to null to clear it.',
      inputSchema: {
        adventureId,
        id: id('encounter'),
        sceneId: z.string().nullable().optional(),
        monsters: z
          .array(
            z.object({
              poolMonsterId: z.string(),
              count: z.number().int().positive().default(1),
              name: z
                .string()
                .min(1)
                .optional()
                .describe('Own name in the initiative tracker, e.g. "Goblin leader"'),
              description: z
                .string()
                .optional()
                .describe('A few words to narrate and tell them apart, e.g. "scarred, burly"'),
              hp: z
                .number()
                .int()
                .positive()
                .optional()
                .describe("Hit points of each, instead of the stat block's"),
            }),
          )
          .optional()
          .describe(
            'Replaces the list. Give leaders, bosses and members of mixed groups their own entry with name and description.',
          ),
        difficulty: z.enum(['low', 'moderate', 'high']).optional(),
        objects: z
          .array(
            z.object({
              id: z.string().optional().describe('Starts with "obj-"; made up if left out'),
              name: z.string().min(1),
              ac: z.number().int().nonnegative().optional(),
              hp: z.number().int().positive(),
              description: z.string().optional(),
            }),
          )
          .optional()
          .describe(
            'Replaces the list. Things the party can destroy, e.g. crystals shielding the boss; they join the initiative tracker without a turn.',
          ),
        mechanics: z
          .array(
            z.object({
              id: z.string().optional().describe('Starts with "mech-"; made up if left out'),
              trigger: MechanicTrigger.describe(
                '"round": at the start of round "round"; "bloodied" or "defeated": when "target" has half its hit points or fewer, or 0; "manual": when the game master decides',
              ),
              round: z.number().int().min(1).optional(),
              target: z.string().optional().describe('Pool monster or object id of this encounter'),
              text: z.string().min(1).describe('What happens'),
            }),
          )
          .optional()
          .describe(
            'Replaces the list. One or two for boss fights and climaxes; the initiative tracker reminds the game master when a trigger fires.',
          ),
      },
    },
    ({ adventureId, objects, mechanics, ...rest }) =>
      run(async () => {
        let saved = '';
        const patch = {
          ...rest,
          objects: objects?.map(({ id, ...object }) => ({ id: id ?? createId('obj'), ...object })),
          mechanics: mechanics?.map(({ id, ...mechanic }) => ({
            id: id ?? createId('mech'),
            ...mechanic,
          })),
        };
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
        'Removes a scene, NPC, item, clue, puzzle, encounter, pool monster or stat block of the adventure ("monster") and every reference to it.',
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
    'suggest_encounter',
    {
      title: 'Suggest a fight',
      description:
        "Puts together monsters for a fight of the given difficulty for the adventure's party, from the SRD and the game master's own monsters. Call it again for another suggestion. Add the monsters with upsert_pool_monster and the fight with upsert_encounter.",
      inputSchema: {
        adventureId,
        difficulty: z.enum(ENCOUNTER_DIFFICULTIES),
        type: z.string().optional().describe('Creature type, e.g. "undead"'),
      },
      annotations: { readOnlyHint: true },
    },
    ({ adventureId, difficulty, type }) =>
      run(async () => {
        const { adventure } = await store.get(adventureId);
        const ownIds = new Set(adventure.monsters.map((m) => m.id));
        const library = (await store.monsters()).filter((m) => !ownIds.has(m.id));
        const all = [...adventure.monsters, ...library].map(monsterStatBlock).concat(srdMonsters);
        const wanted = type?.trim().toLowerCase();
        const candidates = wanted ? all.filter((m) => m.type.toLowerCase().includes(wanted)) : all;
        const found = generateEncounter({ party: adventure.party, difficulty, candidates });
        if (!found) return text('No combination fits. Try another type or difficulty.');
        return text({
          monsters: found.monsters.map(({ statBlock, count }) => ({
            ...monsterSummary(statBlock),
            count,
          })),
          xp: found.xp,
          difficulty: found.rating,
        });
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
    'list_parties',
    {
      title: 'List the parties',
      description:
        "Lists the game master's parties with their player characters: class, level, armor class, hit points, passive Perception, the game master's notes on each (what the player enjoys, background hooks, open threads, things to avoid) and playerNotes, what the player wrote about their character. An adventure's party.partyId names the party it is played with.",
      annotations: { readOnlyHint: true },
    },
    () => run(async () => text({ parties: (await store.parties()).map(partyWithoutPhones) })),
  );

  server.registerTool(
    'check_adventure',
    {
      title: 'Check an adventure',
      description:
        'Finds broken references and weak spots: unreachable scenes, dead ends, clues found in only one place or without ways to find them, unused NPCs and items, encounters that do not fit the party.',
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
        idea: z.string().optional().describe('Plot, places, NPCs, monsters; any length'),
        party: z.string().optional().describe('Name of your party, if it is for them'),
        partySize: z.string().optional().describe('Characters, e.g. 4; default: the party, else 4'),
        partyLevel: z.string().optional().describe('Level, e.g. 3; default: the party, else 1'),
        length: z
          .string()
          .optional()
          .describe('e.g. one-shot, two-evenings, three evenings; default: one-shot'),
        language: z.string().optional().describe('e.g. de; default: app setting'),
        rulesTerms: z.string().optional().describe('en or same; default: app setting'),
      },
    },
    async (args) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: newAdventurePrompt(
              args,
              await appSettings(),
              args.party ? findParty(await store.parties(), args.party) : undefined,
            ),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'adapt_adventure',
    {
      title: 'Adapt an adventure',
      description:
        'Fits an existing adventure to your party: its size and level, or the characters once you know them.',
      argsSchema: {
        adventure: z.string().describe('Title or id of the adventure'),
        party: z.string().optional().describe('Name of your party to fit it to'),
        partySize: z.string().optional().describe('Characters, e.g. 4; default: as saved'),
        partyLevel: z.string().optional().describe('Level, e.g. 3; default: as saved'),
        characters: z
          .string()
          .optional()
          .describe('Class, background and what their players enjoy, one line each'),
      },
    },
    async (args) => {
      const group = args.party ? findParty(await store.parties(), args.party) : undefined;
      const text = adaptAdventurePrompt(args, group);
      return { messages: [{ role: 'user', content: { type: 'text', text } }] };
    },
  );

  server.registerTool(
    'get_table_state',
    {
      title: 'What is happening at the table',
      description:
        'Returns the adventure the game master is running in the Lorewarden app right now: the scene the party is in with its NPCs, items, encounters and exits, the clues still open in other scenes with their leads, all NPCs in short form, the latest session log entries and the running combat. Works only while Lorewarden is running.',
      annotations: { readOnlyHint: true },
    },
    () =>
      run(async () => {
        const state = await tableState();
        if (!state) {
          throw new AdventureError(
            'Lorewarden is not running or no adventure has been played yet. Ask the game master which adventure and scene they are in.',
          );
        }
        return text(describeTable(state, await store.parties()));
      }),
  );

  server.registerPrompt(
    'what_now',
    {
      title: 'What now?',
      description: 'The players did something unexpected: get three ways to react.',
      argsSchema: {
        situation: z.string().describe('What just happened?'),
        scene: z.string().optional().describe('Only if Lorewarden is not running'),
        adventure: z.string().optional().describe('Only if Lorewarden is not running'),
      },
    },
    ({ situation, scene, adventure }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `I am running a Lorewarden adventure right now. Call get_table_state to see the adventure, the scene the party is in and what happened recently. If that does not work, find ${adventure ? `the adventure "${adventure}"` : 'the adventure'} with list_adventures and read it with get_adventure.${scene ? `\n\nThe party is in the scene "${scene}".` : ''}

This just happened at the table: ${situation}

Give me three short ways to react that fit the story, its secrets and its NPCs, each in two or three sentences I can use right away. Where it helps, let one of them place a clue the party still misses (openClues) or bring in an NPC from elsewhere (npcs), so the story moves on. If one needs a new name, NPC or location, invent it. Do not change the adventure unless I ask you to.`,
          },
        },
      ],
    }),
  );

  return server;
}

/** The current scene with the entries it refers to, so the AI needs no second lookup. */
export function describeTable({ adventure, session }: TableState, parties: readonly Party[] = []) {
  const scene = adventure.scenes.find((s) => s.id === session.currentSceneId);
  const title = (id: string) => adventure.scenes.find((s) => s.id === id)?.title ?? id;
  const party = partyOf(adventure, parties);
  const characters = party && partyWithoutPhones(party).characters;
  return {
    adventure: { id: adventure.id, title: adventure.title, summary: adventure.summary },
    party: adventure.party,
    ...(characters ? { characters } : {}),
    currentScene: scene && {
      id: scene.id,
      title: scene.title,
      purpose: scene.purpose,
      features: scene.features,
      wayOut: scene.wayOut,
      description: scene.description,
      notes: scene.notes,
      ending: scene.ending,
      levelUp: scene.levelUp,
      npcs: adventure.npcs.filter((npc) => scene.npcIds.includes(npc.id)),
      items: adventure.items.filter((item) => scene.itemIds.includes(item.id)),
      encounters: adventure.encounters
        .filter((e) => scene.encounterIds.includes(e.id) || e.sceneId === scene.id)
        .map((e) => ({
          ...e,
          monsters: e.monsters.map((m) => {
            const pool = adventure.monsterPool.find((p) => p.id === m.poolMonsterId);
            const resolved = pool && resolvePoolMonster(adventure, pool);
            return {
              ...m,
              name: resolved?.name,
              cr: resolved?.cr,
              hp: resolved?.hp,
              ac: resolved?.ac,
              attacks: resolved?.attacks,
              statBlock: resolved?.statBlock?.id,
            };
          }),
        })),
      exits: scene.exits.map((exit) => ({ ...exit, targetTitle: title(exit.targetSceneId) })),
      clues: cluesInScene(adventure, scene.id),
      puzzles: adventure.puzzles
        .filter((puzzle) => puzzle.sceneId === scene.id)
        .map((puzzle) => ({
          ...puzzle,
          solved: session.solvedPuzzleIds.includes(puzzle.id),
        })),
    },
    foundClues: adventure.clues.filter((clue) => session.foundClueIds.includes(clue.id)),
    // The fallback for improvising: clues still missing elsewhere and every NPC who could turn up.
    openClues: openClues(adventure, session.foundClueIds, scene?.id).map(({ clue, leads }) => ({
      id: clue.id,
      text: clue.text,
      leads: leads.map((lead) => ({ text: lead.text, where: leadPlace(adventure, lead)?.name })),
      scenes: clueSceneIds(adventure, clue).map(title),
    })),
    npcs: adventure.npcs.map((npc) => ({
      id: npc.id,
      name: npc.name,
      role: npc.role,
      voice: npc.voice,
      inScene: scene?.npcIds.includes(npc.id) ?? false,
    })),
    recentLog: session.log.slice(-15),
    ...(session.combat
      ? {
          combat: {
            ...session.combat,
            initiative: session.initiative,
            firedMechanicIds: session.firedMechanicIds,
          },
        }
      : {}),
  };
}

function number(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, min), max) : fallback;
}

/** Instructions that guide the AI through building an adventure in stages, saving as it goes. */
export function newAdventurePrompt(
  args: {
    idea?: string | undefined;
    party?: string | undefined;
    partySize?: string | undefined;
    partyLevel?: string | undefined;
    length?: string | undefined;
    language?: string | undefined;
    rulesTerms?: string | undefined;
  },
  app?: AiSettings,
  /** The game master's party named in args.party, if there is one by that name. */
  group?: Party,
): string {
  // Numbers the game master typed win over those of the party.
  const typed = !!args.partySize?.trim() || !!args.partyLevel?.trim();
  // A party without characters yet has no numbers of its own.
  const known = group && group.characters.length > 0 ? group : undefined;
  const party =
    known && !typed
      ? partyNumbers(known)
      : {
          size: number(args.partySize, known?.characters.length || 4, 1, 12),
          level: number(args.partyLevel, known ? partyNumbers(known).level : 1, 1, 20),
        };
  const characters =
    group && group.characters.length > 0
      ? `\n- The characters of my party "${group.name}":\n\n${describeCharacters(group)
          .split('\n')
          .map((line) => `  ${line}`)
          .join('\n')}\n`
      : args.party?.trim()
        ? `\n- My party: "${args.party.trim()}". Find it with list_parties; if it is not there, ask me about the characters.`
        : '';
  const link = group
    ? ` Then call update_adventure with partyId "${group.id}", so the adventure follows the party.`
    : '';
  const given = args.language?.trim() || undefined;
  const language = given ?? app?.language;
  // What the game master typed wins, then the app's settings; like the app, rules terms stay in
  // English by default.
  const terms = args.rulesTerms?.trim().toLowerCase();
  const wanted = terms === 'same' ? undefined : terms || (app && !given ? app.termsLanguage : 'en');
  const termsLanguage = wanted && wanted !== language ? wanted : undefined;
  const idea = args.idea?.trim() ?? '';
  return `You help me, a game master, write an adventure for a 5e-compatible tabletop RPG and save it with the Lorewarden tools.

## What I want

- Party: ${describePartySize(party)}${characters}
- Length: ${describeLength(args.length)}
- Language of all adventure text: ${language ? describeLanguage(language) : 'the language I write in'}${termsRule(language, termsLanguage)}
- My idea: ${idea === '' ? 'none yet, surprise me' : idea}

## How we work

Work with me step by step and wait for my answer after each step. I decide, you suggest. Talk to me in the language I write in.

Build on everything I already have in mind, from my idea above or from what I write or attach in the chat: a plot, places, NPCs, monsters, scenes. Keep it as I wrote it and fill only the gaps. Skip a step when my ideas already settle it, e.g. no pitches when I bring a plot; tell me which steps you skip. Look up monsters I name with search_monsters; if one is not there, write its stat block with upsert_monster.

1. ${QUESTIONS_STEP}
2. ${PITCH_STEP}
3. ${OUTLINE_STEP} When I agree, call create_adventure with the outline as summary${language ? `, "${language}" as language` : ''}${termsLanguage ? ` and "${termsLanguage}" as termsLanguage` : ''}.${link}
4. Scenes: for each one the title, its location with three striking features, one line on what can happen there, and how the scenes connect. Offer more than one way forward where it makes sense. When I agree, save them with upsert_scene, including purpose, features and wayOut, and link_scenes.
5. Details: write out every scene, then the NPCs, items, clues and puzzles with upsert_npc, upsert_item, upsert_clue and upsert_puzzle. Give a puzzle a simple SVG drawing when seeing it helps, e.g. a lock, a symbol circle or a map fragment. Show me each scene briefly as you go.
6. Encounters: find creatures with search_monsters (pass the adventureId) and add them with upsert_pool_monster and their baseMonsterRef. For a variant of a creature, use the closest one as stand-in (search_monsters with type and nearCr) and put what differs into overrides. For a creature nothing fits, write a full stat block with upsert_monster and the adventureId. ${STAT_BLOCK_RULE} suggest_encounter puts together monsters for a fight of a given difficulty. Then build fights with upsert_encounter, and a battle map for each scene with a fight.
7. Check: call check_adventure and fix what it finds.
8. Review: ${SELF_REVIEW} Then tell me the adventure is ready to play in Lorewarden.

I can skip or repeat any step, e.g. "make scene 4 darker" or "one more way out of the cellar". Change only what I ask for.

## What makes the adventure good

${adventureQualityRules('search_monsters')}
- ${AT_A_GLANCE_RULE}
- ${READ_ALOUD_RULE}
- ${NOTES_RULE}
- ${LINK_RULE}
- The summary holds the ${SUMMARY_CONTENT}.

## Content rules

${contentRules('found with search_monsters')}
- ${budgetRule(party)}
`;
}

/** A party by name or id, ignoring case, as the game master types it into a prompt. */
function findParty(parties: readonly Party[], name: string): Party | undefined {
  const wanted = name.trim().toLocaleLowerCase();
  return parties.find((p) => p.id === name.trim() || p.name.toLocaleLowerCase() === wanted);
}

/** Instructions that fit a saved adventure to the party with small, checked changes. */
export function adaptAdventurePrompt(
  args: {
    adventure: string;
    party?: string | undefined;
    partySize?: string | undefined;
    partyLevel?: string | undefined;
    characters?: string | undefined;
  },
  /** The game master's party named in args.party, if there is one by that name. */
  group?: Party,
): string {
  // A party of the game master brings its size, levels and characters; typed numbers are ignored.
  const size = !group && args.partySize?.trim() ? number(args.partySize, 4, 1, 12) : undefined;
  const level = !group && args.partyLevel?.trim() ? number(args.partyLevel, 1, 1, 20) : undefined;
  const characters = group ? describeCharacters(group) : (args.characters?.trim() ?? '');
  const party = group
    ? `my party "${group.name}" (id ${group.id}); link the adventure to it with update_adventure partyId "${group.id}", and its size and levels follow the characters`
    : args.party?.trim()
      ? `my party "${args.party.trim()}". Find it with list_parties and link the adventure to it with update_adventure partyId; if it is not there, ask me`
      : size === undefined && level === undefined
        ? 'as saved in the adventure'
        : [
            size === undefined ? undefined : `${size} characters`,
            level === undefined ? undefined : `level ${level}`,
          ]
            .filter(Boolean)
            .join(' of ');
  const newParty = [
    size === undefined ? '' : `partySize ${size}`,
    level === undefined ? '' : `partyLevel ${level}`,
  ]
    .filter(Boolean)
    .join(' and ');
  const save = [newParty, characters === '' || group ? '' : 'my notes as "characters"']
    .filter(Boolean)
    .join(' and ');
  return `You help me, a game master, fit an existing Lorewarden adventure for a 5e-compatible tabletop RPG to my party, and save the changes with the Lorewarden tools.

## What I want

- Adventure: "${args.adventure.trim()}". Find it with list_adventures and read it with get_adventure.
- Party: ${party}. Its encounters and rewards may have been written for another party.
- Characters: ${
    characters === ''
      ? 'the "characters" notes of the adventure, if it has any; otherwise ask me once whether I know them, and carry on without them if I do not'
      : `${group ? 'those of my party, with my notes on them' : 'these are my notes'}:

${characters}`
  }

## How we work

Talk to me in the language I write in, and write all adventure text in the language of the adventure.

1. ${save === '' ? 'Rate' : `Save ${save} with update_adventure, then rate`} every encounter with rate_encounter and compare the result with the difficulty it states.
2. Tell me in a short list what you would change and wait for my answer.
3. Save what I agree to, one change at a time: upsert_pool_monster for new creatures or a new "count", upsert_encounter, upsert_item, upsert_scene, upsert_clue and upsert_npc. Change only the fields that need it; never rewrite the whole adventure and never create a new one.
4. Call check_adventure and fix what it finds, then tell me what you changed.

## What to change

- ${ADAPT_ENCOUNTERS_RULE} Find creatures with search_monsters (pass the adventureId) and check the result with rate_encounter.
- ${INDIVIDUALS_RULE}
- ${MECHANICS_RULE}
- ${DIALS_RULE}
- ${ADAPT_REWARDS_RULE}
- ${ADAPT_NOTES_RULE}
- With known characters:
  - ${ADAPT_CHARACTERS_RULE}
  - ${ADAPT_STRENGTHS_RULE}
  - ${ADAPT_KEEP_WITH_CHARACTERS_RULE}
- Without them: ${ADAPT_KEEP_RULE}

## Content rules

${contentRules('found with search_monsters')}
- Rate every encounter with rate_encounter; it uses the XP budget of the SRD 5.2 for the party of the adventure. Never go above "high".
`;
}
