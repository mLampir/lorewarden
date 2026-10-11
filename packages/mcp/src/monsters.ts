import {
  type Adventure,
  encounterBudget,
  experiencePoints,
  type StatBlock,
  srdMonsters,
} from '@lorewarden/core';

export interface MonsterQuery {
  /** Part of the name or type, e.g. "goblin" or "undead". */
  text?: string | undefined;
  type?: string | undefined;
  size?: string | undefined;
  minCr?: number | undefined;
  maxCr?: number | undefined;
  /** Sorts by distance to this challenge rating, to find a stand-in for a creature. */
  nearCr?: number | undefined;
  /** Leaves out monsters too strong for this party on their own. */
  party?: Adventure['party'] | undefined;
  limit?: number | undefined;
}

/** A short line per monster, so a search result stays small; get_monster has the full block. */
export function monsterSummary(monster: StatBlock) {
  const { id, name, size, type, cr, ac, hp } = monster;
  return { id, name, size, type, cr, xp: experiencePoints(cr), ac, hp };
}

/** Searches the SRD 5.2.1 monsters of the library. */
export function searchMonsters(query: MonsterQuery): StatBlock[] {
  const text = query.text?.trim().toLowerCase();
  const type = query.type?.trim().toLowerCase();
  const size = query.size?.trim().toLowerCase();
  const high = query.party ? encounterBudget(query.party).high : Number.POSITIVE_INFINITY;
  const found = srdMonsters.filter(
    (m) =>
      (!text || m.name.toLowerCase().includes(text) || m.type.toLowerCase().includes(text)) &&
      (!type || m.type.toLowerCase().includes(type)) &&
      (!size || m.size.toLowerCase() === size) &&
      (query.minCr === undefined || m.cr >= query.minCr) &&
      (query.maxCr === undefined || m.cr <= query.maxCr) &&
      experiencePoints(m.cr) <= high,
  );
  const near = query.nearCr;
  if (near !== undefined) {
    found.sort((a, b) => Math.abs(a.cr - near) - Math.abs(b.cr - near));
  }
  return found.slice(0, query.limit ?? 20);
}
