import {
  ADVENTURE_FILE_FORMAT,
  ADVENTURE_FILE_VERSION,
  type AdventureFile,
} from './adventure-file';
import { formatChallengeRating } from './challenge-rating';
import { assessEncounter, encounterBudget, isEncounterDifficulty } from './encounter-difficulty';
import { createId } from './ids';
import { type Adventure, Monster } from './model';
import { monstersForParty, srdMonstersForParty } from './monsters';

/** Lengths the app offers as presets; the MCP prompt also takes free text such as "three evenings". */
export type AdventureLength = 'one-shot' | 'two-evenings';

export interface AdventureRequest {
  /** The game master's idea in their own words; may be empty. */
  idea: string;
  partySize: number;
  partyLevel: number;
  /** A preset or the game master's own words, e.g. "three evenings". */
  length: string;
  /** Language the adventure text is written in, as a language tag such as "de". */
  language: string;
  /** Language tag of rules terms such as "DC", if they should differ from the adventure text. */
  termsLanguage?: string;
}

/** Asks for rules terms in another language than the text, for groups who know them that way. */
export function termsRule(language: string | undefined, termsLanguage: string | undefined): string {
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

export const ADVENTURE_LENGTHS: Record<AdventureLength, string> = {
  'one-shot': 'a one-shot for a single evening of 3 to 4 hours, about 4 to 7 scenes',
  'two-evenings': 'a short adventure for one or two evenings, about 6 to 10 scenes',
};

/**
 * The length line of a prompt: a preset's description, or the game master's own words with the
 * per-evening measure the presets use, so "three evenings" or "a few evenings" scale the same way.
 */
export function describeLength(length: string | undefined): string {
  const text = length?.trim() ?? '';
  if (text === '') return ADVENTURE_LENGTHS['one-shot'];
  const preset = ADVENTURE_LENGTHS[text.toLowerCase() as AdventureLength];
  if (preset) return preset;
  return `${text}. Plan an evening as 3 to 4 hours with about 4 to 7 scenes, and scale the scenes, fights and clues to the number of evenings. If the length leaves the number open, e.g. "a few evenings", suggest one in the first step. Let each evening end at a good stopping point, ideally with a cliffhanger or a decision, and give every evening at least one highlight`;
}

/** A tiny but complete adventure that shows the AI every field it should fill. */
export const promptExample: AdventureFile = {
  format: ADVENTURE_FILE_FORMAT,
  version: ADVENTURE_FILE_VERSION,
  exportedAt: '2026-01-01T00:00:00.000Z',
  adventure: {
    id: 'adv-mill',
    title: 'The Silent Mill',
    summary:
      'Hook: the miller has not been seen for three days. Truth: his apprentice made a pact with a will-o-wisp to win the mill and lured him into the cellar. Goal: free the miller before the next new moon. If they fail: at the new moon the wisp drags the miller into the river and the apprentice runs the mill.',
    ruleset: 'srd-5.2',
    language: 'en',
    party: { size: 4, level: 2 },
    startSceneId: 'scene-yard',
    scenes: [
      {
        id: 'scene-yard',
        title: 'The Mill Yard',
        purpose: 'The party learns that the apprentice is lying.',
        features: ['Silent water wheel', 'Flour dust like snow', 'Locked sluice gate'],
        wayOut: 'Into the mill once they doubt her story, or along the footprints to the river.',
        description:
          'The water wheel stands still. Flour dust covers the yard like snow and muffles every step.',
        notes:
          '- **Together**: ask each player what their character owes the miller.\n- **Apprentice** claims the miller went to town.\n- **Footprints** in the flour lead to the cellar hatch.\n- **Too late**: after nightfall the pale light already glows through the cellar grate.',
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
        purpose: 'The party frees the miller and faces the wisp.',
        features: ['Knee-deep cold water', 'Stacked grain sacks', 'Pale drifting light'],
        wayOut: 'Ends when the miller is free; the wisp flees into the river.',
        description:
          'Knee-deep water fills the cellar. A pale light flickers behind the grain sacks.',
        notes:
          '- **Miller** is tied up behind the sacks.\n- **Wisp** attacks when anyone comes near.\n- **Easier**: it flees at half its hit points.\n- **Harder**: a second swarm bursts from the sacks in round two.\n- **Ending**: handed to the village, the apprentice is chased away and the mill falls silent; forgiven, she works it with the miller.',
        npcIds: [],
        itemIds: ['item-key'],
        assetIds: [],
        exits: [],
        encounterIds: ['enc-cellar'],
        ending: true,
        battleMap: {
          width: 10,
          height: 8,
          features: [
            { kind: 'water', x: 0, y: 3, w: 10, h: 5, label: 'Knee-deep water' },
            { kind: 'stairs', x: 0, y: 0, w: 2, h: 2, label: 'Stairs up' },
            { kind: 'wall', x: 2, y: 0, w: 1, h: 2 },
            { kind: 'cover', x: 6, y: 1, w: 3, h: 1, label: 'Grain sacks' },
            { kind: 'obstacle', x: 4, y: 5, w: 1, h: 1, label: 'Pillar' },
            { kind: 'party', x: 0, y: 2, w: 2, h: 1 },
            { kind: 'enemy', x: 7, y: 0, w: 1, h: 1, label: 'Wisp' },
          ],
          notes:
            'Dark except for the light of the wisp. The water is difficult terrain. The miller lies tied up behind the sacks.',
        },
      },
    ],
    monsterPool: [
      {
        id: 'pool-wisp',
        name: "Will-o'-Wisp",
        description: 'A drifting ball of pale light.',
        cr: 2,
        count: { min: 1, max: 1 },
        baseMonsterRef: 'srd-will-o-wisp',
        overrides: {
          notes: 'Lured here by the apprentice; flees into the river if the miller is freed.',
        },
        tags: ['undead'],
      },
      {
        id: 'pool-weevils',
        name: 'Grain Weevil Swarm',
        description: 'A rustling carpet of black beetles pouring out of the sacks.',
        cr: 0.125,
        count: { min: 1, max: 2 },
        baseMonsterRef: 'monster-grain-weevils',
        overrides: {},
        tags: ['vermin'],
      },
    ],
    npcs: [
      {
        id: 'npc-apprentice',
        name: 'Tamsin',
        role: 'Apprentice',
        description: 'Nervous, floury hands, never looks anyone in the eye.',
        voice:
          'Quick and breathless, swallows the ends of words, keeps saying "no trouble, no trouble".',
        notes:
          '- **Wants** the mill for herself.\n- **Breaks down** if confronted with the footprints.',
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
        monsters: [
          {
            poolMonsterId: 'pool-wisp',
            count: 1,
            name: 'The Pale Lantern',
            description: "Flares up whenever someone speaks the miller's name",
          },
          { poolMonsterId: 'pool-weevils', count: 1 },
        ],
        difficulty: 'moderate',
        objects: [
          {
            id: 'obj-lantern',
            name: "The Miller's Lantern",
            ac: 12,
            hp: 5,
            description: 'Hangs from a beam; the wisp slips into it to hide.',
          },
        ],
        mechanics: [
          {
            id: 'mech-cellar-flood',
            trigger: 'round',
            round: 3,
            text: 'The sluice upstream gives way: the water rises to waist height and the miller starts to drown unless someone frees him this round.',
          },
          {
            id: 'mech-cellar-lantern',
            trigger: 'defeated',
            target: 'obj-lantern',
            text: 'The wisp loses its hiding place: it can no longer turn invisible and flees into the river.',
          },
        ],
      },
    ],
    clues: [
      {
        id: 'clue-footprints',
        text: 'The miller never left for town.',
        notes: '',
        sceneIds: ['scene-yard', 'scene-cellar'],
        leads: [
          {
            text: 'Trace: two sets of footprints lead to the cellar, only one comes back.',
            sceneId: 'scene-yard',
          },
          { text: 'Object: his coat still hangs by the cellar door.', sceneId: 'scene-cellar' },
          {
            text: 'Witness: the apprentice gets tangled up about when he left.',
            npcId: 'npc-apprentice',
          },
        ],
      },
    ],
    puzzles: [
      {
        id: 'puzzle-sluice',
        title: 'The Sluice Gate',
        sceneId: 'scene-yard',
        prompt:
          'Carved into the sluice gate: "I turn but never walk, I grind but have no teeth, and I sleep while the river is held." Below it are three levers marked with a sun, a moon and a wave.',
        solution:
          'The water wheel. Pulling the wave lever opens the sluice, the wheel turns and the cellar hatch unlocks.',
        hints: [
          { id: 'hint-sluice-still', text: 'Something in this yard should be moving, but is not.' },
          { id: 'hint-sluice-river', text: 'The answer needs the river to wake up.' },
        ],
        notes:
          '- **Wrong lever** drops a sack of flour on whoever pulled it.\n- **Giving up**: the apprentice opens the hatch to get rid of them and lets slip that she knows the way.',
      },
    ],
    monsters: [
      {
        id: 'monster-grain-weevils',
        source: { kind: 'custom', title: 'The Silent Mill' },
        name: 'Grain Weevil Swarm',
        size: 'medium',
        type: 'swarm of tiny beasts',
        alignment: 'unaligned',
        cr: 0.125,
        ac: 11,
        hp: 10,
        hitDice: '3d8 - 3',
        speed: '20 ft., Climb 20 ft.',
        abilities: { str: 3, dex: 13, con: 8, int: 1, wis: 7, cha: 2 },
        saves: {},
        resistances: 'Bludgeoning, Piercing, Slashing',
        senses: 'Blindsight 10 ft.; Passive Perception 8',
        languages: 'None',
        traits: [
          {
            name: 'Swarm',
            text: "The swarm can occupy another creature's space and vice versa, and it can move through any opening large enough for a Tiny beast. It can't regain Hit Points or gain Temporary Hit Points.",
          },
        ],
        actions: [
          {
            name: 'Bites',
            text: 'Melee Attack Roll: +3, reach 5 ft. 3 (1d4 + 1) Piercing damage, or 1 (1d2) Piercing damage if the swarm has half its Hit Points or fewer.',
          },
        ],
        bonusActions: [],
        reactions: [],
        legendaryActions: [],
        notes: 'Bursts out of the grain sacks when the wisp attacks.',
      },
    ],
  },
};

/**
 * Builds instructions for an AI assistant such as Claude to develop an adventure together with the
 * game master and hand it back as a Lorewarden adventure file.
 *
 * The working steps and quality rules follow the eight steps of the Lazy GM's Resource Document
 * (CC BY 4.0), written in our own words. The attribution is in the README.
 */
export function buildAdventurePrompt(
  request: AdventureRequest,
  library: readonly Monster[] = [],
): string {
  const idea = request.idea.trim();
  return `You help me, a game master, write an adventure for a 5e-compatible tabletop RPG. At the end you give me the adventure as a file for Lorewarden, a game master tool.

## What I want

- Party: ${request.partySize} characters of level ${request.partyLevel}
- Length: ${describeLength(request.length)}
- Language of all adventure text: ${describeLanguage(request.language)}${termsRule(request.language, request.termsLanguage)}
- My idea: ${idea === '' ? 'none yet, surprise me' : idea}

## How we work

Work with me step by step and wait for my answer after each step. I decide, you suggest. Talk to me in the language I answer in; the adventure text is always in the language above.

1. ${QUESTIONS_STEP}
2. ${PITCH_STEP}
3. ${OUTLINE_STEP}
4. Scenes: for each one the title, its location with three striking features, one line on what can happen there, and how the scenes connect. Offer more than one way forward where it makes sense. Then the important NPCs, the monsters and the rewards.
5. Review: ${SELF_REVIEW}
6. Write the full adventure file.

If I paste error messages from Lorewarden back to you, fix the file and send it again in full.

## What makes the adventure good

${adventureQualityRules('the lists of monsters at the end')}

## Content rules

${contentRules('listed at the end')}
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
- Give every NPC a "voice": one short line on how to speak them, e.g. "Quick and breathless, swallows the ends of words, keeps saying 'no trouble, no trouble'".
${FILE_RULES}
- "battleMap": a grid of 5-foot squares, at most 30 by 30, usually 8 to 20 squares wide. Each feature is a rectangle of squares: "x" and "y" count from the top left corner starting at 0, "w" and "h" are its width and height in squares, and it must lie inside the map. "kind" is one of "wall", "door", "water", "difficult" (rubble, undergrowth, mud), "hazard" (fire, a pit, a trap), "obstacle" (blocks movement and sight, such as a pillar or a tree), "cover" (half cover, such as crates or a low wall), "stairs", "party" or "enemy" (where they start). Give features a short "label" where it helps. Use 5 to 20 features. Put light, elevation and what changes during the fight into "notes".
- Leave "assets" empty.
${monsterRule('like "monster-grain-weevils" in the example')}

${monsterList({ size: request.partySize, level: request.partyLevel }, library)}
`;
}

/**
 * Builds instructions for an AI assistant to fit an adventure to the party it now says it is for:
 * another size or level after it was duplicated, and the characters once the game master knows
 * them. The answer goes through parseAdaptedAdventure.
 */
export function buildAdaptPrompt(
  adventure: Adventure,
  now: Date = new Date(),
  library: readonly Monster[] = [],
): string {
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
- ${INDIVIDUALS_RULE}
- ${MECHANICS_RULE}
- ${DIALS_RULE}
- Rewards: add, remove or change items so the loot suits the number and level of the characters.
- Adjust "notes" where they mention numbers of enemies or anything else that depends on the party.
${
  characters === ''
    ? '- Everything else stays word for word: the story, scenes, exits, NPCs, clues and all ids, including the "id" of the adventure.'
    : `- Characters: give every character one moment in the adventure that is theirs. Rewrite the start scene so every character has their own reason to be there, keep the questions that tie the characters together if they have not played together yet, tie the start to at least one of them, connect one or two secrets, clues or NPCs to their backgrounds, and make at least one reward something a particular character would want. Say in "notes" which character a change is meant for.
- Encounters and scenes: besides the numbers, prefer situations in which the strengths of these characters matter and their players get to do what they enjoy.
- Keep the plot, the scenes and how they connect, the truth behind the story and all ids, including the "id" of the adventure. Change text only where it ties in a character.`
}

${
  misfits.length > 0
    ? `These encounters do not fit the party:\n\n${misfits.join('\n')}`
    : 'By the numbers every encounter fits the party. Check anyway whether they still feel right.'
}

## Content rules

${contentRules('listed at the end')}
- ${budgetRule(adventure.party)}

## The adventure

\`\`\`json
${JSON.stringify(file, null, 2)}
\`\`\`

## File format

Reply with exactly one \`\`\`json code block that contains the whole file and nothing else, with the same field names and types as above.

Rules for the file:

${FILE_RULES}
- Keep "assets" and "assetIds" exactly as they are. Keep the stat blocks in "monsters" unless a creature changes; you may add new ones.
${monsterRule(`with the same fields as this example:\n\n\`\`\`json\n${JSON.stringify(exampleMonster(), null, 2)}\n\`\`\`\n`)}

${monsterList(adventure.party, library)}
`;
}

/**
 * Lists the SRD monsters and the game master's own monsters an encounter for this party can use,
 * so the AI picks valid ids.
 */
function monsterList(party: Adventure['party'], library: readonly Monster[]): string {
  const line = (m: { id: string; name: string; size: string; type: string; cr: number }) =>
    `- ${m.id}: ${m.name}, ${m.size} ${m.type}, CR ${formatChallengeRating(m.cr)}`;
  const own = monstersForParty(library, party);
  const ownList =
    own.length > 0
      ? `## My own monsters

Lorewarden has the full stat block of each of these creatures I made. Use them like the SRD monsters, without copying them into "monsters".

${own.map(line).join('\n')}

`
      : '';
  return `${ownList}## SRD monsters

Lorewarden has the full stat block of each of these creatures. Stronger ones do not fit this party.

${srdMonstersForParty(party).map(line).join('\n')}`;
}

/** Tells the AI how Lorewarden rates an encounter, with the numbers for this party. */
export function budgetRule(party: Adventure['party']): string {
  const budget = encounterBudget(party);
  return `Rate every encounter by the XP budget of the SRD 5.2: add up the XP of its monsters by challenge rating. For this party up to ${budget.low} XP is "low", up to ${budget.moderate} XP is "moderate" and up to ${budget.high} XP is "high". Never go above that.`;
}

/** The outline the scenes are built on: an antagonist who acts, a twist and more than one ending. */
export const OUTLINE_STEP =
  'Outline: the strong start, the goal, the antagonist with motive and plan, what happens if the party does nothing (two or three steps the antagonist takes on its own), the truth behind it with a twist the clues prepare, six to ten secrets and clues, and the climax with two or three ways it can end.';

/** A last pass over the draft with the eyes of the players, before it is handed over. */
export const SELF_REVIEW =
  'Read the draft as my players would and improve it: does the start pull them in at once, can they reach the climax even if they miss clues or fail checks, does every scene offer a real choice, does the antagonist act on its own, do two scenes feel alike, what is still generic. Tell me in a short list what you would improve, and change what I agree to.';

export const QUEST_KINDS =
  'defeat a leader, take out their lieutenants, find something, rescue someone, steal something, destroy something, clear a place of danger, gather several keys, defend a place or stop a ritual';

/** The first questions: who plays, what they like and how much fighting fits the evening. */
export const QUESTIONS_STEP =
  'Ask me up to five short questions: who the characters are (class, background, what their players enjoy), then whether my group has played together before and what happened, tone, setting, themes, how much fighting my group enjoys and how long a fight takes at our table, and anything my group does not want at the table. If I do not know the characters yet, carry on without them.';

/** Pitches with enough substance to choose from, and away from the first, most obvious idea. */
export const PITCH_STEP = `Pitch three short adventure ideas, each built on a different kind of quest: ${QUEST_KINDS}. Give each a title, the hook in one sentence, a twist and the place or moment the players will remember. Skip the first idea that comes to mind and stock plots, such as a cult summoning a demon or a villain who is evil for its own sake, unless I ask for them. I pick one or mix them.`;

/** Ties pool monsters to stat blocks of the library, so the game master can look them up in play. */
const monsterRule = (
  example: string,
) => `- "baseMonsterRef": for a creature from the lists of monsters at the end, its id from the list, and "cr" is its challenge rating from the list. For a variant with another name, look or weapon, use the closest creature from the lists and put what differs into "overrides".
- For a creature you invent because nothing in the lists fits, write a full stat block into "monsters" ${example}, with an id starting with "monster-", and set the pool monster's "baseMonsterRef" to it and its "cr" to the stat block's. ${STAT_BLOCK_RULE}`;

/** How an invented stat block should read, for every set of instructions that asks for one. */
export const STAT_BLOCK_RULE = `Build it like the SRD stat blocks: the same structure, rules wording and numbers that suit its challenge rating. "saves" lists only saving throws that differ from the ability modifier.`;

/** The invented creature of the example, to show the fields of a stat block. */
const exampleMonster = (): Monster => {
  const monster = promptExample.adventure.monsters[0];
  if (!monster) throw new Error('The example has no invented monster');
  return monster;
};

/** Keeps puzzles fun at the table: playable on the phones and never a dead end. */
export const PUZZLE_RULE =
  'Puzzles: one or two riddles, locks or other puzzles fit most adventures; put them into "puzzles" in the scene where the party meets them. "prompt" is what the players see and can be shown on their phones, so write it as the inscription, riddle or sight itself. Give two or three "hints", from a gentle nudge to almost the answer. A puzzle must never be the only way forward: say in "notes" what happens on a wrong answer and how the party gets on if they give up.';

/** Makes monsters in a fight differ, so the game master can tell them apart and narrate them. */
export const INDIVIDUALS_RULE =
  'Individual monsters: where it adds something, such as a leader, a boss or a mixed group, give monsters of an encounter their own entry in its "monsters" with a "name", a short "description" I can narrate and tell them apart by, and "hp" when they are tougher or weaker than the stat block, e.g. { "poolMonsterId": "pool-goblin", "count": 1, "name": "Goblin leader", "description": "Scarred, burly, gives the orders", "hp": 12 } next to { "poolMonsterId": "pool-goblin", "count": 3 }. Plain groups need only "count". Every monster counts for the XP budget as usual.';

/** Makes boss fights and climaxes memorable; the initiative tracker reminds of the triggers. */
export const MECHANICS_RULE =
  'Boss fights and climaxes: give the big fights, not every fight, one or two mechanics that make them more than trading blows. Pick from this toolbox: phases (when the boss is bloodied it changes, calls for help or flees to the next room), a countdown (the ritual is complete after 3 rounds, the water rises every round), a weak spot or protection (crystals shield the boss until they are destroyed), an item or knowledge that weakens it (holy water, a mirror, its true name), changing terrain (the floor gives way, torches go out, a bridge tips over), a goal other than killing (free the hostage, close the portal, escape with the treasure), reinforcements in waves, and morale (the minions flee when their leader falls). Put them into the "mechanics" of the encounter: each has an "id" starting with "mech-", a "trigger" and a "text" saying what happens. "trigger" is "round" with the "round" whose start sets it off, "bloodied" (half its hit points or fewer) or "defeated" (0 hit points) with the "target" pool monster or object of the encounter it watches, or "manual" when I decide. Things the party can destroy, such as the crystals, go into the "objects" of the encounter with an "id" starting with "obj-", a "name", "ac", "hp" and a short "description". Place clues to a weakness or a helpful item in earlier scenes and record them as clues.';

/** Keeps notes quick to scan at the table; Lorewarden shows bullets and bold words. */
export const NOTES_RULE =
  'Write every "notes" as bullet points, one short line each starting with "- ", with the key word of each point in **bold**, e.g. "- **Apprentice** lies about the miller". No headings, tables or other formatting.';

/** The fields at the top of a scene that tell the game master what it is about in seconds. */
export const AT_A_GLANCE_RULE =
  'Give every scene its "purpose": one sentence on what the scene is for, e.g. "The party learns the apprentice lies"; its "features": three short, evocative features of the location, two to four words each; and its "wayOut": one line on how the scene usually ends or where it leads.';

/** Read-aloud text that sets the scene in a few seconds and hands the turn to the players. */
export const READ_ALOUD_RULE =
  'The "description" of a scene sets it in the present tense with at least one sense besides sight, such as a sound, a smell or the cold, and ends on something the players can react to. Never say what the characters feel, think or do.';

/** What the "summary" of an adventure holds, so the game master has the whole story in a glance. */
export const SUMMARY_CONTENT =
  'hook, antagonist and plan, the truth behind it, the goal and what happens if the party fails';

/** Lets the game master tune a fight at the table instead of rebuilding it. */
export const DIALS_RULE =
  'Dials: for every encounter, add one line to the "notes" of its scene on how I make it easier and how I make it harder at the table, e.g. fewer or more hit points, enemies that flee or reinforcements that arrive, less or more damage, one attack fewer or more.';

const FILE_RULES = `- "format" is "${ADVENTURE_FILE_FORMAT}" and "version" is ${ADVENTURE_FILE_VERSION}.
- Every id is unique and starts with its kind: "scene-", "npc-", "item-", "pool-", "enc-", "obj-", "mech-", "clue-", "puzzle-", "hint-", "monster-".
- Every id you reference must exist: startSceneId, npcIds, itemIds, encounterIds, exits[].targetSceneId, encounters[].sceneId, encounters[].monsters[].poolMonsterId, encounters[].mechanics[].target (a pool monster or object of that encounter), clues[].sceneIds, clues[].leads[].sceneId, clues[].leads[].npcId and puzzles[].sceneId.
- "description" is read aloud to the players: two or three sentences. "notes" are secrets for the game master only.
- ${READ_ALOUD_RULE}
- ${NOTES_RULE}
- ${AT_A_GLANCE_RULE}
- "summary" is a short overview for the game master: ${SUMMARY_CONTENT}.
- Set "ending": true on every scene where the adventure can end. Every other scene needs at least one exit.
- "cr" is a challenge rating: 0, 0.125, 0.25, 0.5 or a whole number from 1 to 30.
- "difficulty" is one of "low", "moderate" or "high".`;

/**
 * What makes a generated adventure good to run, shared by every set of instructions for the AI.
 * srdMonsters says where the AI finds the SRD creatures Lorewarden has stat blocks for.
 */
export function adventureQualityRules(srdMonsters: string): string {
  return `- Characters: build the hook and at least one scene, secret or reward around a particular character, if I told you about them.
- Strong start: the start scene opens in the middle of something happening, close to the action, so the players have to act right away. No waiting in a tavern for a quest.
- Bringing the party together: in a group's first adventure the characters are usually made after the adventure, by players free to choose any character, and may not know each other. Then give the start a reason to be there that fits any character, e.g. fellow passengers, guests at the same wedding or prisoners in the same cell, so the danger makes them a group. Put two or three questions into the "notes" of the start scene that I ask the players to tie their characters together, e.g. "Why do you trust the person on your left?". If the group has played together before, build on what happened instead: an NPC, a place or a loose end from an earlier adventure.
- Scenes: they are possibilities, not a script. Keep each one short and do not assume the party visits them in a fixed order or solves them in one way.
- The antagonist acts: while the party is busy, the antagonist follows the plan. Let the party see signs of it before the climax, and put into the "notes" of a scene what has changed if they arrive late.
- Choices: give the party at least one hard decision without a clean answer, e.g. save the hostage or catch the culprit, spare a villain they understand or hand them over. Let the ending depend on what they chose and say in the "notes" of every ending scene how.
- Pacing: mix talking, exploring, puzzles and fights, and never put two fights in a row without something else between them. Fit the number of fights to how much my group enjoys fighting and how long a fight takes at our table. If you do not know, plan two for an evening, the climax being one of them, and let other conflicts be solved without a fight or kept short. Let the tension rise towards the climax, with a short breather right before it, and keep an early fight low or moderate.
- Failing forward: a failed check, a lost fight or a missed clue never stops the adventure. It costs something, such as time, a wound, an ally or the upper hand, and the story goes on.
- Be specific: one concrete detail beats a generic description, e.g. "the chapel whose bell rings by itself at noon" rather than "an old chapel". Avoid clichés and the names AI assistants overuse, such as Elara, Lyra, Thorne, Kael or Seraphina; choose names that fit the setting and are easy to say aloud.
- Secrets and clues: one truth each, in one sentence, about the story, the antagonist, the history of the place or a character. They are reminders for me, not text for the players. Write what the party learns, not how they find it; I decide that at the table. Split a clue that holds two truths into two. Put two or three ways the party could find it into "leads", e.g. a witness, a trace or an object, each starting with its kind ("Witness: ...") and tied to where it turns up: "sceneId" for a trace or object in a scene, "npcId" for an NPC who knows it, so I only read the ways that fit the scene we are in. A clue can be found in its "sceneIds" and wherever its leads turn up, so spread them over at least two, better three scenes.
- Locations: give every location a short, evocative name and three features the characters can notice and use; put them into "features" of the scene. Put what the players perceive into "description" and what is hidden into "notes".
- NPCs: only the ones that matter. Each has a name, a tie to the story, something they want, one trait that makes them easy to play and a voice I can perform at the table: pitch, pace, one quirk and a phrase they like to say.
- ${PUZZLE_RULE}
- Monsters: choose creatures that fit the location and the story. Every fight has a reason and the enemies want something, so the party can also talk, trick, sneak past or scare them off. Prefer creatures from ${srdMonsters}, so I have their full stat block at the table.
- Battle maps: give every scene with an encounter a simple battle map I can copy onto a battle mat. Show only what matters for the fight: walls, doors, cover, obstacles, difficult terrain and hazards, plus where the party and the enemies start. Give the place something to use or fight over, such as cover, a height or a hazard.
- ${INDIVIDUALS_RULE}
- ${MECHANICS_RULE}
- ${DIALS_RULE}
- Rewards: at least one item that suits a particular character or leads deeper into the story, for example by carrying a secret.`;
}

/** Keeps generated adventures free of protected content; srdMonsters says where the SRD creatures are. */
export function contentRules(srdMonsters: string): string {
  return `- Use only creatures from the System Reference Document (SRD 5.2, CC BY 4.0), ${srdMonsters}, or creatures you invent. Never copy text or stat blocks from commercial books.
- Do not use trademarks such as "D&D" or "Dungeons & Dragons".`;
}

export interface MonsterRequest {
  /** What the game master has in mind, in their own words. */
  idea: string;
  /** Challenge rating the creature should have, if the game master has decided. */
  cr?: number;
  /** Language of names and descriptions, as a language tag such as "de". */
  language: string;
  termsLanguage?: string;
}

/** Builds instructions for an AI assistant to write the stat block of a creature the game master wants. */
export function buildMonsterPrompt(request: MonsterRequest): string {
  const idea = request.idea.trim();
  const example: Monster = { ...exampleMonster(), source: { kind: 'custom' }, notes: '' };
  return `You help me, a game master of a 5e-compatible tabletop RPG, create a monster for Lorewarden, a game master tool.

## What I want

- The creature: ${idea === '' ? 'surprise me' : idea}
- Challenge rating: ${request.cr === undefined ? 'whatever suits the creature' : formatChallengeRating(request.cr)}
- Language of its name, notes and the text of its traits and actions: ${describeLanguage(request.language)}${termsRule(request.language, request.termsLanguage)}

## How we work

Talk to me in the language I write in. If the creature is unclear, ask me up to three short questions first. Then write the stat block. If I ask for changes or paste error messages from Lorewarden, send the whole stat block again.

## Rules

- ${STAT_BLOCK_RULE}
- Check the numbers against the challenge rating: armor class, hit points, attack bonus, save DCs and damage per round.
- Put tactics, looks and how to play it into "notes".
- Never copy text or stat blocks from commercial books. Do not use trademarks such as "D&D" or "Dungeons & Dragons".

## Format

Reply with exactly one \`\`\`json code block that contains the stat block and nothing else. It must follow this example in every field name and type:

\`\`\`json
${JSON.stringify(example, null, 2)}
\`\`\`

- "size" is one of "tiny", "small", "medium", "large", "huge" or "gargantuan".
- "cr" is 0, 0.125, 0.25, 0.5 or a whole number from 1 to 30.
- "initiative" is optional; leave it out when it is the Dexterity modifier.
- Leave out lists you do not need, such as "legendaryActions".
`;
}

export type MonsterParseResult =
  | { ok: true; monster: Monster }
  | { ok: false; problems: { path: string; message: string }[] };

/** Reads the stat block an AI assistant wrote, giving it a fresh id. */
export function parseMonster(json: string): MonsterParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (error) {
    return {
      ok: false,
      problems: [{ path: '', message: `Invalid JSON: ${(error as Error).message}` }],
    };
  }
  const body = typeof raw === 'object' && raw !== null ? raw : {};
  const parsed = Monster.safeParse({
    ...body,
    id: createId('monster'),
    source: { kind: 'custom' },
  });
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    };
  }
  return { ok: true, monster: parsed.data };
}
