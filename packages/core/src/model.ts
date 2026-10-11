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

export const Monster = z.object({
  id: Id,
  source: ContentSource,
  name: z.string().min(1),
  cr: ChallengeRating,
  type: z.string().min(1),
  size: Size,
  ac: z.number().int().nonnegative().optional(),
  hp: z.number().int().positive().optional(),
  speed: z.string().optional(),
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
  /** Monsters the user typed in or imported for this adventure. */
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
  hp: z.object({ current: z.number().int(), max: z.number().int().positive() }).optional(),
  conditions: z.array(z.string()).default([]),
  /** Pool monster or NPC this combatant was created from, if any. */
  ref: Id.optional(),
});

export const Reveal = z.object({
  id: Id,
  at: z.iso.datetime(),
  kind: z.enum(['asset', 'text']),
  assetId: Id.optional(),
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
  revealed: z.array(Reveal).default([]),
  /** Clues the party has found in this session. */
  foundClueIds: z.array(Id).default([]),
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
export type Adventure = z.infer<typeof Adventure>;
export type LogEntry = z.infer<typeof LogEntry>;
export type Combatant = z.infer<typeof Combatant>;
export type Reveal = z.infer<typeof Reveal>;
export type Session = z.infer<typeof Session>;
