import {
  ADVENTURE_FILE_FORMAT,
  ADVENTURE_FILE_VERSION,
  type AdventureFile,
} from './adventure-file';

export type AdventureLength = 'one-shot' | 'two-evenings';

export interface AdventureRequest {
  /** The game master's idea in their own words; may be empty. */
  idea: string;
  partySize: number;
  partyLevel: number;
  length: AdventureLength;
  /** Language the adventure text is written in, as a name the AI understands, e.g. "German". */
  language: string;
}

const LENGTHS: Record<AdventureLength, string> = {
  'one-shot': 'a one-shot for a single evening of 3 to 4 hours, about 4 to 7 scenes',
  'two-evenings': 'a short adventure for one or two evenings, about 6 to 10 scenes',
};

/** A tiny but complete adventure that shows the AI every field it should fill. */
export const promptExample: AdventureFile = {
  format: ADVENTURE_FILE_FORMAT,
  version: ADVENTURE_FILE_VERSION,
  exportedAt: '2026-01-01T00:00:00.000Z',
  adventure: {
    id: 'adv-mill',
    title: 'The Silent Mill',
    summary:
      'Hook: the miller has not been seen for three days. Truth: his apprentice made a pact with a will-o-wisp to win the mill and lured him into the cellar. Goal: free the miller before the next new moon.',
    ruleset: 'srd-5.2',
    party: { size: 4, level: 1 },
    startSceneId: 'scene-yard',
    scenes: [
      {
        id: 'scene-yard',
        title: 'The Mill Yard',
        description: 'The water wheel stands still. Flour dust covers the yard like snow.',
        notes: 'The apprentice claims the miller went to town.',
        npcIds: ['npc-apprentice'],
        itemIds: [],
        assetIds: [],
        exits: [
          { label: 'Enter the mill', targetSceneId: 'scene-cellar' },
          {
            label: 'Search the river bank',
            targetSceneId: 'scene-cellar',
            condition: 'Only if they find the footprints',
          },
        ],
        encounterIds: [],
        ending: false,
      },
      {
        id: 'scene-cellar',
        title: 'The Flooded Cellar',
        description: 'Knee-deep water and a pale light flickering behind the grain sacks.',
        notes: 'The miller is tied up behind the sacks. The light attacks when anyone comes near.',
        npcIds: [],
        itemIds: ['item-key'],
        assetIds: [],
        exits: [],
        encounterIds: ['enc-cellar'],
        ending: true,
      },
    ],
    monsterPool: [
      {
        id: 'pool-wisp',
        name: 'Will-o-wisp',
        description: 'A drifting ball of pale light.',
        cr: 2,
        count: { min: 1, max: 1 },
        overrides: {},
        tags: ['undead'],
      },
    ],
    npcs: [
      {
        id: 'npc-apprentice',
        name: 'Tamsin',
        role: 'Apprentice',
        description: 'Nervous, floury hands, never looks anyone in the eye.',
        notes: 'Wants the mill for herself. Breaks down if confronted with the footprints.',
        tags: [],
      },
    ],
    items: [
      {
        id: 'item-key',
        name: 'Rusty Cellar Key',
        description: 'Still wet.',
        rarity: 'mundane',
        notes: '',
      },
    ],
    assets: [],
    encounters: [
      {
        id: 'enc-cellar',
        sceneId: 'scene-cellar',
        monsters: [{ poolMonsterId: 'pool-wisp', count: 1 }],
        difficulty: 'high',
      },
    ],
    clues: [
      {
        id: 'clue-footprints',
        text: 'Two sets of footprints lead to the cellar, but only one comes back.',
        notes: 'Shows the miller never left for town.',
        sceneIds: ['scene-yard', 'scene-cellar'],
      },
    ],
    monsters: [],
  },
};

/**
 * Builds instructions for an AI assistant such as Claude to develop an adventure together with the
 * game master and hand it back as a Lorewarden adventure file.
 */
export function buildAdventurePrompt(request: AdventureRequest): string {
  const idea = request.idea.trim();
  return `You help me, a game master, write an adventure for a 5e-compatible tabletop RPG. At the end you give me the adventure as a file for Lorewarden, a game master tool.

## What I want

- Party: ${request.partySize} characters of level ${request.partyLevel}
- Length: ${LENGTHS[request.length]}
- Language of all adventure text: ${request.language}
- My idea: ${idea === '' ? 'none yet, surprise me' : idea}

## How we work

Work with me step by step and wait for my answer after each step. I decide, you suggest.

1. Ask me up to five short questions about tone, setting, themes and anything my group does not want at the table.
2. Pitch three short adventure ideas. I pick one or mix them.
3. Outline: hook, goal, antagonist and motive, the truth behind it, the most important clues.
4. Scene list: titles, one line each, and how scenes connect. Offer more than one way forward where it makes sense.
5. Write the full adventure file.

If I paste error messages from Lorewarden back to you, fix the file and send it again in full.

## Content rules

- Use only creatures from the System Reference Document (SRD 5.2, CC BY 4.0) or creatures you invent. Never copy text or stat blocks from commercial books.
- Do not use trademarks such as "D&D" or "Dungeons & Dragons".
- Make every important clue findable in at least two scenes, better three.
- Keep encounters fair for the party size and level above.

## File format

Reply with exactly one \`\`\`json code block that contains the whole file and nothing else. It must follow this example in every field name and type:

\`\`\`json
${JSON.stringify(promptExample, null, 2)}
\`\`\`

Rules for the file:

- "format" is "${ADVENTURE_FILE_FORMAT}" and "version" is ${ADVENTURE_FILE_VERSION}.
- Every id is unique and starts with its kind: "scene-", "npc-", "item-", "pool-", "enc-", "clue-".
- Every id you reference must exist: startSceneId, npcIds, itemIds, encounterIds, exits[].targetSceneId, encounters[].sceneId, encounters[].monsters[].poolMonsterId and clues[].sceneIds.
- "description" is read aloud to the players. "notes" are secrets for the game master only.
- "summary" is a short overview for the game master: hook, antagonist, the truth behind it, the goal.
- Set "ending": true on every scene where the adventure can end. Every other scene needs at least one exit.
- "cr" is a challenge rating: 0, 0.125, 0.25, 0.5 or a whole number from 1 to 30.
- "difficulty" is one of "low", "moderate" or "high".
- Leave "assets" and "monsters" empty and leave out "baseMonsterRef". Put attacks, hit points and armor class of invented creatures into "overrides" ("attacks", "hp", "ac").
`;
}
