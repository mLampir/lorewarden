import monsterData from '../data/srd-5.2.1-monsters.json';
import ruleData from '../data/srd-5.2.1-rules.json';

export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

export const ABILITIES: readonly Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

/** A trait or an action of a stat block. Usage limits such as "(Recharge 5–6)" are in the name. */
export interface StatBlockFeature {
  name: string;
  text: string;
}

/** A full monster stat block as printed in the SRD 5.2.1. Rules text stays in English. */
export interface StatBlock {
  /** Library id, always starting with "srd-", e.g. "srd-goblin-warrior". */
  id: string;
  name: string;
  size: string;
  type: string;
  alignment: string;
  cr: number;
  ac: number;
  hp: number;
  hitDice: string;
  speed: string;
  /** Initiative modifier; the score for initiative without a roll is 10 plus this. */
  initiative: number;
  abilities: Record<Ability, number>;
  saves: Record<Ability, number>;
  skills?: string;
  vulnerabilities?: string;
  resistances?: string;
  immunities?: string;
  senses: string;
  languages: string;
  traits?: StatBlockFeature[];
  actions?: StatBlockFeature[];
  bonusActions?: StatBlockFeature[];
  reactions?: StatBlockFeature[];
  legendaryActions?: StatBlockFeature[];
}

/** Where the monsters come from, for the attribution the license asks for. */
export const SRD_MONSTER_SOURCE = {
  title: 'SRD 5.2.1',
  license: 'CC BY 4.0',
  url: 'https://www.dndbeyond.com/srd',
} as const;

/** All monsters of the SRD 5.2.1, sorted by name. */
export const srdMonsters: readonly StatBlock[] = monsterData as StatBlock[];

const byId = new Map(srdMonsters.map((monster) => [monster.id, monster]));

export function findSrdMonster(id: string | undefined): StatBlock | undefined {
  return id === undefined ? undefined : byId.get(id);
}

/** Ability modifier of a score, e.g. +2 for 15. */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** An entry of the Rules Glossary of the SRD 5.2.1, e.g. a condition or an action. */
export interface Rule {
  /** Library id, always starting with "srd-rule-", e.g. "srd-rule-prone". */
  id: string;
  name: string;
  /** The family the rule belongs to: "Condition", "Action", "Area of Effect", "Hazard" or "Attitude". */
  tag?: string;
  /** Plain text; tables are one line per row with cells separated by " · ". */
  text: string;
}

/** All entries of the Rules Glossary of the SRD 5.2.1, sorted by name. */
export const srdRules: readonly Rule[] = ruleData as Rule[];

const rulesById = new Map(srdRules.map((rule) => [rule.id, rule]));

export function findSrdRule(id: string | undefined): Rule | undefined {
  return id === undefined ? undefined : rulesById.get(id);
}
