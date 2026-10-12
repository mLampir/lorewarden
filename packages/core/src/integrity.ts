import type { Adventure } from './model';
import { findSrdMonster } from './monsters';

export interface IntegrityProblem {
  /** Dotted path to the offending field, e.g. "scenes[2].exits[0].targetSceneId". */
  path: string;
  message: string;
}

/**
 * Checks references between entities that the schema alone cannot see:
 * duplicate ids and links to scenes, NPCs, items, assets, encounters or monsters that do not exist.
 */
export function checkIntegrity(adventure: Adventure): IntegrityProblem[] {
  const problems: IntegrityProblem[] = [];

  const collect = <T extends { id: string }>(list: T[], name: string) => {
    const ids = new Set<string>();
    for (const [i, entry] of list.entries()) {
      if (ids.has(entry.id)) {
        problems.push({ path: `${name}[${i}].id`, message: `Duplicate id "${entry.id}"` });
      }
      ids.add(entry.id);
    }
    return ids;
  };

  const sceneIds = collect(adventure.scenes, 'scenes');
  const npcIds = collect(adventure.npcs, 'npcs');
  const itemIds = collect(adventure.items, 'items');
  const assetIds = collect(adventure.assets, 'assets');
  const encounterIds = collect(adventure.encounters, 'encounters');
  const poolIds = collect(adventure.monsterPool, 'monsterPool');
  const monsterIds = collect(adventure.monsters, 'monsters');
  collect(adventure.clues, 'clues');
  collect(adventure.puzzles, 'puzzles');

  const expect = (ids: Set<string>, id: string | undefined, path: string, kind: string) => {
    if (id !== undefined && !ids.has(id)) {
      problems.push({ path, message: `Unknown ${kind} "${id}"` });
    }
  };

  expect(sceneIds, adventure.startSceneId, 'startSceneId', 'scene');

  for (const [s, scene] of adventure.scenes.entries()) {
    const at = `scenes[${s}]`;
    for (const [i, id] of scene.npcIds.entries()) expect(npcIds, id, `${at}.npcIds[${i}]`, 'NPC');
    for (const [i, id] of scene.itemIds.entries()) {
      expect(itemIds, id, `${at}.itemIds[${i}]`, 'item');
    }
    for (const [i, id] of scene.assetIds.entries()) {
      expect(assetIds, id, `${at}.assetIds[${i}]`, 'asset');
    }
    for (const [i, id] of scene.encounterIds.entries()) {
      expect(encounterIds, id, `${at}.encounterIds[${i}]`, 'encounter');
    }
    for (const [i, exit] of scene.exits.entries()) {
      expect(sceneIds, exit.targetSceneId, `${at}.exits[${i}].targetSceneId`, 'scene');
    }
    const map = scene.battleMap;
    for (const [i, f] of map?.features.entries() ?? []) {
      if (map && (f.x + f.w > map.width || f.y + f.h > map.height)) {
        problems.push({
          path: `${at}.battleMap.features[${i}]`,
          message: `Reaches outside the ${map.width}×${map.height} map`,
        });
      }
    }
  }

  const objectIds = collect(
    adventure.encounters.flatMap((encounter) => encounter.objects),
    'encounters[].objects',
  );
  collect(
    adventure.encounters.flatMap((encounter) => encounter.mechanics),
    'encounters[].mechanics',
  );
  for (const [e, encounter] of adventure.encounters.entries()) {
    const at = `encounters[${e}]`;
    expect(sceneIds, encounter.sceneId, `${at}.sceneId`, 'scene');
    for (const [i, m] of encounter.monsters.entries()) {
      expect(poolIds, m.poolMonsterId, `${at}.monsters[${i}].poolMonsterId`, 'pool monster');
    }
    // Triggers watch a creature or object of this very encounter.
    const targets = new Set([
      ...encounter.monsters.map((m) => m.poolMonsterId),
      ...encounter.objects.map((o) => o.id),
    ]);
    for (const [i, mechanic] of encounter.mechanics.entries()) {
      const path = `${at}.mechanics[${i}]`;
      if (mechanic.trigger === 'round' && mechanic.round === undefined) {
        problems.push({ path: `${path}.round`, message: 'A "round" trigger needs a round' });
      }
      if (mechanic.trigger === 'bloodied' || mechanic.trigger === 'defeated') {
        if (mechanic.target === undefined) {
          problems.push({
            path: `${path}.target`,
            message: `A "${mechanic.trigger}" trigger needs a pool monster or object of the encounter`,
          });
        } else if (!targets.has(mechanic.target) && objectIds.has(mechanic.target)) {
          problems.push({
            path: `${path}.target`,
            message: `Object "${mechanic.target}" belongs to another encounter`,
          });
        } else {
          expect(
            targets,
            mechanic.target,
            `${path}.target`,
            'pool monster or object of the encounter',
          );
        }
      }
    }
  }

  for (const [c, clue] of adventure.clues.entries()) {
    for (const [i, id] of clue.sceneIds.entries()) {
      expect(sceneIds, id, `clues[${c}].sceneIds[${i}]`, 'scene');
    }
  }

  for (const [p, puzzle] of adventure.puzzles.entries()) {
    expect(sceneIds, puzzle.sceneId, `puzzles[${p}].sceneId`, 'scene');
    expect(assetIds, puzzle.assetId, `puzzles[${p}].assetId`, 'asset');
    collect(puzzle.hints, `puzzles[${p}].hints`);
  }

  // A pool monster can be based on a monster of the adventure or on one of the SRD library.
  for (const [p, pm] of adventure.monsterPool.entries()) {
    if (findSrdMonster(pm.baseMonsterRef)) continue;
    expect(monsterIds, pm.baseMonsterRef, `monsterPool[${p}].baseMonsterRef`, 'monster');
  }

  return problems;
}
