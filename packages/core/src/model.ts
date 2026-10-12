import { z } from 'zod';
import { isValidChallengeRating } from './challenge-rating';

export const Id = z.string().min(1);

/** Which edition of the System Reference Document the rules math follows. */
export const Ruleset = z.enum(['srd-5.1', 'srd-5.2']);

export const Size = z.enum(['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan']);

export const ChallengeRating = z
  .number()
  .refine(isValidChallengeRating, { message: 'Not a valid challenge rating' });

export const ContentSource = z.object({
  /** "srd" and "open5e" come from an import, "custom" is typed in by the user. */
  kind: z.enum(['srd', 'open5e', 'custom']),
  /** Human-readable source, e.g. "SRD 5.2.1" or the publisher of an Open5e document. */
  title: z.string().optional(),
  license: z.string().optional(),
  url: z.url().optional(),
});

/** A trait or an action of a stat block. Usage limits such as "(Recharge 5–6)" are in the name. */
export const MonsterFeature = z.object({
  name: z.string().min(1),
  text: z.string().default(''),
});

const abilities = <T extends z.ZodType>(score: T) =>
  z.object({ str: score, dex: score, con: score, int: score, wis: score, cha: score });

/**
 * A monster with a full stat block that is not in the SRD library: invented by the game master or
 * an AI assistant, or an SRD monster copied and changed. Same fields as an SRD stat block.
 */
export const Monster = z.object({
  id: Id,
  source: ContentSource.default({ kind: 'custom' }),
  name: z.string().min(1),
  size: Size,
  type: z.string().min(1),
  alignment: z.string().default(''),
  cr: ChallengeRating,
  ac: z.number().int().nonnegative(),
  hp: z.number().int().positive(),
  /** How the hit points are rolled, e.g. "5d8 + 5". */
  hitDice: z.string().default(''),
  speed: z.string().default('30 ft.'),
  /** Initiative modifier; the Dexterity modifier if left out. */
  initiative: z.number().int().optional(),
  abilities: abilities(z.number().int().min(1).max(30)).default({
    str: 10,
    dex: 10,
    con: 10,
    int: 10,
    wis: 10,
    cha: 10,
  }),
  /** Saving throw bonuses that differ from the ability modifier. */
  saves: abilities(z.number().int()).partial().default({}),
  skills: z.string().optional(),
  vulnerabilities: z.string().optional(),
  resistances: z.string().optional(),
  immunities: z.string().optional(),
  senses: z.string().default(''),
  languages: z.string().default(''),
  traits: z.array(MonsterFeature).default([]),
  actions: z.array(MonsterFeature).default([]),
  bonusActions: z.array(MonsterFeature).default([]),
  reactions: z.array(MonsterFeature).default([]),
  legendaryActions: z.array(MonsterFeature).default([]),
  /** Tactics, looks and anything else for the game master. */
  notes: z.string().default(''),
});

export const PoolMonster = z.object({
  id: Id,
  name: z.string().min(1),
  description: z.string().default(''),
  cr: ChallengeRating,
  count: z
    .object({ min: z.number().int().nonnegative(), max: z.number().int().nonnegative() })
    .refine((c) => c.min <= c.max, { message: 'min must not exceed max' }),
  /** Library monster used as a stand-in when the adventure's creature has no stat block. */
  baseMonsterRef: Id.optional(),
  overrides: z
    .object({
      name: z.string().optional(),
      hp: z.number().int().positive().optional(),
      ac: z.number().int().nonnegative().optional(),
      damageType: z.string().optional(),
      attacks: z.string().optional(),
      notes: z.string().optional(),
    })
    .default({}),
  tags: z.array(z.string()).default([]),
});

export const Npc = z.object({
  id: Id,
  name: z.string().min(1),
  role: z.string().optional(),
  description: z.string().default(''),
  /** How the game master voices and plays the NPC: pitch, accent, pace, catchphrases. */
  voice: z.string().default(''),
  notes: z.string().default(''),
  tags: z.array(z.string()).default([]),
});

export const Item = z.object({
  id: Id,
  name: z.string().min(1),
  description: z.string().default(''),
  rarity: z.string().optional(),
  notes: z.string().default(''),
});

export const Asset = z.object({
  id: Id,
  kind: z.enum(['map', 'handout', 'image']),
  title: z.string().min(1),
  mimeType: z.string().min(1),
  /** The image as a data URL, both in exported files and inside the app. */
  src: z.string().min(1),
});

export const SceneExit = z.object({
  label: z.string().min(1),
  targetSceneId: Id,
  condition: z.string().optional(),
});

/** What a square of a battle map holds. Areas are drawn first, objects and start zones on top. */
export const BattleMapFeatureKind = z.enum([
  'water',
  'difficult',
  'hazard',
  'wall',
  'door',
  'obstacle',
  'cover',
  'stairs',
  'party',
  'enemy',
]);

/** A rectangle of squares on a battle map; x and y count from the top left corner, starting at 0. */
export const BattleMapFeature = z.object({
  kind: BattleMapFeatureKind,
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  w: z.number().int().positive().default(1),
  h: z.number().int().positive().default(1),
  label: z.string().optional(),
});

/** A sketch of where a fight takes place, on a grid of 5-foot squares, to copy onto a battle mat. */
export const BattleMap = z.object({
  width: z.number().int().min(1).max(60),
  height: z.number().int().min(1).max(60),
  features: z.array(BattleMapFeature).default([]),
  /** Light, elevation, what changes during the fight. */
  notes: z.string().default(''),
});

export const Scene = z.object({
  id: Id,
  title: z.string().min(1),
  description: z.string().default(''),
  notes: z.string().default(''),
  npcIds: z.array(Id).default([]),
  itemIds: z.array(Id).default([]),
  assetIds: z.array(Id).default([]),
  exits: z.array(SceneExit).default([]),
  encounterIds: z.array(Id).default([]),
  /** Marks a scene where the adventure can end, so a scene without exits is not a dead end. */
  ending: z.boolean().default(false),
  battleMap: BattleMap.optional(),
});

/** A piece of information the party needs to move on, and the scenes where it can be found. */
export const Clue = z.object({
  id: Id,
  text: z.string().min(1),
  notes: z.string().default(''),
  sceneIds: z.array(Id).default([]),
});

/** A nudge towards the solution of a puzzle, from gentle to nearly giving it away. */
export const PuzzleHint = z.object({
  id: Id,
  text: z.string().min(1),
});

/**
 * A riddle, lock or other puzzle the party has to solve. The prompt and the image can be shown on
 * the players' phones, and so can each hint, to everyone or to some players.
 */
export const Puzzle = z.object({
  id: Id,
  title: z.string().min(1),
  /** Scene where the party meets the puzzle. */
  sceneId: Id.optional(),
  /** What the players see or hear: the riddle, the inscription, what is on the door. */
  prompt: z.string().default(''),
  /** An image of the puzzle, e.g. a drawing of the lock, shown together with the prompt. */
  assetId: Id.optional(),
  solution: z.string().default(''),
  /** In the order they should be given. */
  hints: z.array(PuzzleHint).default([]),
  /** For the game master: checks that help, what happens on success or on a wrong answer. */
  notes: z.string().default(''),
});

export const Encounter = z.object({
  id: Id,
  sceneId: Id.optional(),
  monsters: z.array(z.object({ poolMonsterId: Id, count: z.number().int().positive() })),
  difficulty: z.string().optional(),
});

export const Adventure = z.object({
  id: Id,
  title: z.string().min(1),
  /** What the adventure is about, for the game master only: hook, antagonist, the truth behind it. */
  summary: z.string().default(''),
  ruleset: Ruleset.default('srd-5.2'),
  /** Language the adventure text is written in, as a language tag such as "en" or "pt-BR". */
  language: z.string().min(2).optional(),
  /**
   * Language of rules terms such as "DC" or "Perception" when it differs from the adventure text,
   * e.g. "en" for a German adventure played with the English rulebooks.
   */
  termsLanguage: z.string().min(2).optional(),
  party: z.object({
    size: z.number().int().positive(),
    level: z.number().int().min(1).max(20),
    /** The game master's notes on the characters: class, background, what their players enjoy. */
    characters: z.string().optional(),
  }),
  startSceneId: Id.optional(),
  scenes: z.array(Scene).default([]),
  monsterPool: z.array(PoolMonster).default([]),
  npcs: z.array(Npc).default([]),
  items: z.array(Item).default([]),
  assets: z.array(Asset).default([]),
  encounters: z.array(Encounter).default([]),
  clues: z.array(Clue).default([]),
  puzzles: z.array(Puzzle).default([]),
  /** Stat blocks of the creatures the adventure invents, so the file works without a library. */
  monsters: z.array(Monster).default([]),
});

export const LogEntry = z.object({
  id: Id,
  at: z.iso.datetime(),
  /** "note" is typed by the game master, "scene" is written when the party moves to a scene. */
  kind: z.enum(['note', 'scene']).default('note'),
  /** The note, or for scene entries the scene title at the time of the move. */
  text: z.string().min(1),
  sceneId: Id.optional(),
});

export const Combatant = z.object({
  id: Id,
  name: z.string().min(1),
  kind: z.enum(['pc', 'npc', 'monster']),
  initiative: z.number().int(),
  /** Modifier added to a d20 roll for this combatant's initiative, e.g. from a stat block. */
  initiativeBonus: z.number().int().optional(),
  /**
   * Where the initiative came from: the stat block's score (10 plus the modifier), a d20 roll,
   * or a value the game master typed in. Rolling on combat start leaves typed values alone.
   */
  initiativeSource: z.enum(['score', 'roll', 'typed']).optional(),
  hp: z.object({ current: z.number().int(), max: z.number().int().positive() }).optional(),
  conditions: z.array(z.string()).default([]),
  /** Pool monster or NPC this combatant was created from, if any. */
  ref: Id.optional(),
});

/** Someone at the table who has joined the session with the player app. */
export const Player = z.object({
  /** Created by the player's phone and kept there, so the player keeps it when rejoining. */
  id: Id.max(64),
  name: z.string().trim().min(1).max(40),
});

/** A handout, image, hint or puzzle the game master has shown on the players' phones. */
export const Reveal = z.object({
  id: Id,
  at: z.iso.datetime(),
  /** "puzzle" shows a puzzle's prompt and image, "puzzleHint" one of its hints. */
  kind: z.enum(['asset', 'text', 'puzzle', 'puzzleHint']),
  assetId: Id.optional(),
  puzzleId: Id.optional(),
  hintId: Id.optional(),
  /** Heading of a text reveal; asset reveals show the asset's title. */
  title: z.string().optional(),
  text: z.string().optional(),
  /** "all" or the ids of the players who may see it. */
  to: z.union([z.literal('all'), z.array(Id).min(1)]),
});

export const Session = z.object({
  id: Id,
  adventureId: Id,
  startedAt: z.iso.datetime(),
  currentSceneId: Id.optional(),
  log: z.array(LogEntry).default([]),
  /** Combatants in turn order, highest initiative first. */
  initiative: z.array(Combatant).default([]),
  /** Set while a combat is running; turn is the index into initiative. */
  combat: z
    .object({ round: z.number().int().min(1), turn: z.number().int().nonnegative() })
    .optional(),
  /** Players who have joined with the player app, so reveals can be addressed to them. */
  players: z.array(Player).default([]),
  revealed: z.array(Reveal).default([]),
  /** Clues the party has found in this session. */
  foundClueIds: z.array(Id).default([]),
  /** Puzzles the party has solved in this session. */
  solvedPuzzleIds: z.array(Id).default([]),
});

export type Ruleset = z.infer<typeof Ruleset>;
export type Size = z.infer<typeof Size>;
export type ContentSource = z.infer<typeof ContentSource>;
export type Monster = z.infer<typeof Monster>;
export type PoolMonster = z.infer<typeof PoolMonster>;
export type Npc = z.infer<typeof Npc>;
export type Item = z.infer<typeof Item>;
export type Asset = z.infer<typeof Asset>;
export type SceneExit = z.infer<typeof SceneExit>;
export type BattleMapFeatureKind = z.infer<typeof BattleMapFeatureKind>;
export type BattleMapFeature = z.infer<typeof BattleMapFeature>;
export type BattleMap = z.infer<typeof BattleMap>;
export type Scene = z.infer<typeof Scene>;
export type Encounter = z.infer<typeof Encounter>;
export type Clue = z.infer<typeof Clue>;
export type PuzzleHint = z.infer<typeof PuzzleHint>;
export type Puzzle = z.infer<typeof Puzzle>;
export type Adventure = z.infer<typeof Adventure>;
export type LogEntry = z.infer<typeof LogEntry>;
export type Combatant = z.infer<typeof Combatant>;
export type Player = z.infer<typeof Player>;
export type Reveal = z.infer<typeof Reveal>;
export type Session = z.infer<typeof Session>;
