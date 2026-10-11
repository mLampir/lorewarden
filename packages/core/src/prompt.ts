import {
  ADVENTURE_FILE_FORMAT,
  ADVENTURE_FILE_VERSION,
  type AdventureFile,
} from './adventure-file';
import { assessEncounter, encounterBudget, isEncounterDifficulty } from './encounter-difficulty';
import type { Adventure } from './model';

export type AdventureLength = 'one-shot' | 'two-evenings';

export interface AdventureRequest {
  /** The game master's idea in their own words; may be empty. */
  idea: string;
  partySize: number;
  partyLevel: number;
  length: AdventureLength;
  /** Language the adventure text is written in, as a language tag such as "de". */
  language: string;
  /** Language tag of rules terms such as "DC", if they should differ from the adventure text. */
  termsLanguage?: string;
}

/** Asks for rules terms in another language than the text, for groups who know them that way. */
function termsRule(language: string | undefined, termsLanguage: string | undefined): string {
  if (!termsLanguage || termsLanguage === language) return '';
  return `\n- Rules terms: ${describeLanguage(termsLanguage)}. Write ability scores, skills, conditions, damage types, abbreviations such as DC, AC and HP, and the names of spells and creatures from the SRD the way the rulebooks in that language print them, even in the middle of a sentence, e.g. "DC 12 Wisdom (Perception)" for English. Everything else, including names you invent, stays in the language of the adventure text.`;
}

/** English name of a language tag with the tag itself, e.g. "German (de)", so the AI cannot misread it. */
export function describeLanguage(tag: string): string {
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'language' }).of(tag);
    return name && name !== tag ? `${name} (${tag})` : tag;
  } catch {
    return tag;
  }
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
    language: 'en',
    party: { size: 4, level: 2 },
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
        notes:
          'The miller is tied up behind the sacks. The light attacks when anyone comes near. Easier: it flees at half its hit points. Harder: a second light rises from the water in round two.',
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
        difficulty: 'moderate',
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
 *
 * The working steps and quality rules follow the eight steps of the Lazy GM's Resource Document
 * (CC BY 4.0), written in our own words. The attribution is in the README.
 */
export function buildAdventurePrompt(request: AdventureRequest): string {
  const idea = request.idea.trim();
  return `You help me, a game master, write an adventure for a 5e-compatible tabletop RPG. At the end you give me the adventure as a file for Lorewarden, a game master tool.

## What I want

- Party: ${request.partySize} characters of level ${request.partyLevel}
- Length: ${LENGTHS[request.length]}
- Language of all adventure text: ${describeLanguage(request.language)}${termsRule(request.language, request.termsLanguage)}
- My idea: ${idea === '' ? 'none yet, surprise me' : idea}

## How we work

Work with me step by step and wait for my answer after each step. I decide, you suggest. Talk to me in the language I answer in; the adventure text is always in the language above.

1. Ask me up to five short questions: who the characters are (class, background, what their players enjoy), then tone, setting, themes and anything my group does not want at the table. If I do not know the characters yet, carry on without them.
2. Pitch three short adventure ideas, each built on a different kind of quest: ${QUEST_KINDS}. I pick one or mix them.
3. Outline: the strong start, the goal, the antagonist and motive, the truth behind it, and six to ten secrets and clues.
4. Scenes: for each one the title, its location with three striking features, one line on what can happen there, and how the scenes connect. Offer more than one way forward where it makes sense. Then the important NPCs, the monsters and the rewards.
5. Write the full adventure file.

If I paste error messages from Lorewarden back to you, fix the file and send it again in full.

## What makes the adventure good

- Characters: build the hook and at least one scene, secret or reward around a particular character, if I told you about them.
- Strong start: the start scene opens in the middle of something happening, close to the action, so the players have to act right away. No waiting in a tavern for a quest.
- Scenes: they are possibilities, not a script. Keep each one short and do not assume the party visits them in a fixed order or solves them in one way.
- Secrets and clues: one sentence each, about the story, the antagonist, the history of the place or a character. Write what the party learns, not how they find it; I decide that at the table. The scenes you list for a clue are only where it is most likely found, so list at least two, better three.
- Locations: give every location a short, evocative name and three features the characters can notice and use. Put what the players perceive into "description" and what is hidden into "notes".
- NPCs: only the ones that matter. Each has a name, a tie to the story, something they want and one trait that makes them easy to play.
- Monsters: choose creatures that fit the location and the story. Not every one has to be fought.
- ${DIALS_RULE}
- Rewards: at least one item that suits a particular character or leads deeper into the story, for example by carrying a secret.

## Content rules

- Use only creatures from the System Reference Document (SRD 5.2, CC BY 4.0) or creatures you invent. Never copy text or stat blocks from commercial books.
- Do not use trademarks such as "D&D" or "Dungeons & Dragons".
- ${budgetRule({ size: request.partySize, level: request.partyLevel })}

## File format

Reply with exactly one \`\`\`json code block that contains the whole file and nothing else. It must follow this example in every field name and type:

\`\`\`json
${JSON.stringify(promptExample, null, 2)}
\`\`\`

Rules for the file:

- "language" is "${request.language}".${
    request.termsLanguage && request.termsLanguage !== request.language
      ? `\n- "termsLanguage" is "${request.termsLanguage}", right after "language".`
      : ''
  }
- If I told you about the characters, add "characters" to "party": one short line per character with name, class, background and what their player enjoys.
${FILE_RULES}
- Leave "assets" and "monsters" empty and leave out "baseMonsterRef". Put attacks, hit points and armor class of invented creatures into "overrides" ("attacks", "hp", "ac").
`;
}

/**
 * Builds instructions for an AI assistant to fit an adventure to the party it now says it is for:
 * another size or level after it was duplicated, and the characters once the game master knows
 * them. The answer goes through parseAdaptedAdventure.
 */
export function buildAdaptPrompt(adventure: Adventure, now: Date = new Date()): string {
  const { size, level } = adventure.party;
  const characters = adventure.party.characters?.trim() ?? '';
  const misfits = adventure.encounters.flatMap((encounter) => {
    const assessment = assessEncounter(adventure, encounter);
    if (!assessment) return [];
    const stated = isEncounterDifficulty(encounter.difficulty) ? encounter.difficulty : undefined;
    if (assessment.rating === stated) return [];
    const now = assessment.rating === 'beyond' ? 'above the high budget' : assessment.rating;
    return [
      `- "${encounter.id}": ${assessment.xp} XP, meant to be ${stated ?? 'fair'}, now ${now}`,
    ];
  });
  // Asset data can be many megabytes of images; Lorewarden puts it back on import.
  const file: AdventureFile = {
    format: ADVENTURE_FILE_FORMAT,
    version: ADVENTURE_FILE_VERSION,
    exportedAt: now.toISOString(),
    adventure: { ...adventure, assets: [] },
  };
  return `You help me, a game master, fit an existing adventure for a 5e-compatible tabletop RPG to my party. At the end you give me the adapted adventure as a file for Lorewarden, a game master tool.

## What I want

- Party: ${size} characters of level ${level}. The file below already says so, but its encounters and rewards may have been written for another party.
- Language of all adventure text: ${adventure.language ? describeLanguage(adventure.language) : 'the language the adventure is written in'}${termsRule(adventure.language, adventure.termsLanguage)}
${
  characters === ''
    ? ''
    : `
## The characters

The adventure was written without knowing them. These are my notes:

${characters}
`
}
## How we work

Talk to me in the language I write in. First tell me in a short list what you would change and wait for my answer. Then write the full adventure file.

If I paste error messages from Lorewarden back to you, fix the file and send it again in full.

## What to change

- Encounters: change how many monsters appear, swap creatures or add new ones to "monsterPool", so that every encounter matches the difficulty it states. Keep what the encounter feels like in the story.
- Update "count" in "monsterPool" when an encounter needs more or fewer of a creature.
- ${DIALS_RULE}
- Rewards: add, remove or change items so the loot suits the number and level of the characters.
- Adjust "notes" where they mention numbers of enemies or anything else that depends on the party.
${
  characters === ''
    ? '- Everything else stays word for word: the story, scenes, exits, NPCs, clues and all ids, including the "id" of the adventure.'
    : `- Characters: give every character one moment in the adventure that is theirs. Tie the start to at least one of them, connect one or two secrets, clues or NPCs to their backgrounds, and make at least one reward something a particular character would want. Say in "notes" which character a change is meant for.
- Encounters: besides the numbers, prefer situations in which the strengths of these characters matter.
- Keep the plot, the scenes and how they connect, the truth behind the story and all ids, including the "id" of the adventure. Change text only where it ties in a character.`
}

${
  misfits.length > 0
    ? `These encounters do not fit the party:\n\n${misfits.join('\n')}`
    : 'By the numbers every encounter fits the party. Check anyway whether they still feel right.'
}

## Content rules

- Use only creatures from the System Reference Document (SRD 5.2, CC BY 4.0) or creatures you invent. Never copy text or stat blocks from commercial books.
- Do not use trademarks such as "D&D" or "Dungeons & Dragons".
- ${budgetRule(adventure.party)}

## The adventure

\`\`\`json
${JSON.stringify(file, null, 2)}
\`\`\`

## File format

Reply with exactly one \`\`\`json code block that contains the whole file and nothing else, with the same field names and types as above.

Rules for the file:

${FILE_RULES}
- Keep "assets", "assetIds", "monsters" and "baseMonsterRef" exactly as they are. Put attacks, hit points and armor class of invented creatures into "overrides" ("attacks", "hp", "ac").
`;
}

/** Tells the AI how Lorewarden rates an encounter, with the numbers for this party. */
function budgetRule(party: Adventure['party']): string {
  const budget = encounterBudget(party);
  return `Rate every encounter by the XP budget of the SRD 5.2: add up the XP of its monsters by challenge rating. For this party up to ${budget.low} XP is "low", up to ${budget.moderate} XP is "moderate" and up to ${budget.high} XP is "high". Never go above that.`;
}

const QUEST_KINDS =
  'defeat a leader, take out their lieutenants, find something, rescue someone, steal something, destroy something, clear a place of danger, gather several keys, defend a place or stop a ritual';

/** Lets the game master tune a fight at the table instead of rebuilding it. */
const DIALS_RULE =
  'Dials: for every encounter, add one line to the "notes" of its scene on how I make it easier and how I make it harder at the table, e.g. fewer or more hit points, enemies that flee or reinforcements that arrive, less or more damage, one attack fewer or more.';

const FILE_RULES = `- "format" is "${ADVENTURE_FILE_FORMAT}" and "version" is ${ADVENTURE_FILE_VERSION}.
- Every id is unique and starts with its kind: "scene-", "npc-", "item-", "pool-", "enc-", "clue-".
- Every id you reference must exist: startSceneId, npcIds, itemIds, encounterIds, exits[].targetSceneId, encounters[].sceneId, encounters[].monsters[].poolMonsterId and clues[].sceneIds.
- "description" is read aloud to the players. "notes" are secrets for the game master only.
- "summary" is a short overview for the game master: hook, antagonist, the truth behind it, the goal.
- Set "ending": true on every scene where the adventure can end. Every other scene needs at least one exit.
- "cr" is a challenge rating: 0, 0.125, 0.25, 0.5 or a whole number from 1 to 30.
- "difficulty" is one of "low", "moderate" or "high".`;
