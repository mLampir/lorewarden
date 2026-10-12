import { describe, expect, it } from 'vitest';
import {
  buildTermIndex,
  checkIntegrity,
  combatantFromNpc,
  linkTerms,
  npcMonster,
  parseAdventure,
  serializeAdventure,
} from '../src';
import { loadExample, nth } from './helpers';

/** The example adventure with Old Brannoc fighting as the marsh eel, named after him. */
function fightingBrannoc() {
  const adventure = loadExample();
  const pool = nth(adventure.monsterPool, 0);
  pool.name = 'Old Brannoc';
  pool.overrides = { ...pool.overrides, name: 'Old Brannoc' };
  const npc = nth(adventure.npcs, 0);
  npc.poolMonsterId = pool.id;
  return { adventure, npc };
}

describe('NPCs who fight', () => {
  it('have the stat block of their pool monster', () => {
    const { adventure, npc } = fightingBrannoc();
    expect(npcMonster(adventure, npc)?.statBlock?.name).toBe('Reed Stalker');
    expect(npcMonster(adventure, nth(adventure.npcs, 1))).toBeUndefined();
  });

  it('join the initiative with hit points and initiative score', () => {
    const { adventure, npc } = fightingBrannoc();
    const statBlock = npcMonster(adventure, npc)?.statBlock;
    const combatant = combatantFromNpc(npc, adventure);
    expect(combatant).toMatchObject({
      name: 'Old Brannoc',
      kind: 'npc',
      ref: npc.id,
      initiative: 10 + (statBlock?.initiative ?? 0),
      initiativeSource: 'score',
      hp: { current: statBlock?.hp, max: statBlock?.hp },
    });
    expect(combatantFromNpc(nth(adventure.npcs, 1), adventure)).toMatchObject({
      initiative: 0,
      hp: undefined,
    });
  });

  it('show the NPC card with the stat block where the creature is named', () => {
    const { adventure } = fightingBrannoc();
    const [segment] = linkTerms('Old Brannoc attacks.', buildTermIndex(adventure)).filter(
      (s) => s.target,
    );
    expect(segment?.target).toMatchObject({
      kind: 'npc',
      npc: { name: 'Old Brannoc' },
      monster: { statBlock: { name: 'Reed Stalker' } },
    });
  });

  it('need a pool monster that exists', () => {
    const { adventure, npc } = fightingBrannoc();
    expect(parseAdventure(serializeAdventure(adventure)).ok).toBe(true);
    npc.poolMonsterId = 'pool-gone';
    expect(checkIntegrity(adventure)).toContainEqual({
      path: 'npcs[0].poolMonsterId',
      message: 'Unknown pool monster "pool-gone"',
    });
  });
});
