import type { Adventure } from './model';

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

  for (const [e, encounter] of adventure.encounters.entries()) {
    expect(sceneIds, encounter.sceneId, `encounters[${e}].sceneId`, 'scene');
    for (const [i, m] of encounter.monsters.entries()) {
      const path = `encounters[${e}].monsters[${i}].poolMonsterId`;
      expect(poolIds, m.poolMonsterId, path, 'pool monster');
    }
  }

  for (const [c, clue] of adventure.clues.entries()) {
    for (const [i, id] of clue.sceneIds.entries()) {
      expect(sceneIds, id, `clues[${c}].sceneIds[${i}]`, 'scene');
    }
  }

  for (const [p, pm] of adventure.monsterPool.entries()) {
    expect(monsterIds, pm.baseMonsterRef, `monsterPool[${p}].baseMonsterRef`, 'monster');
  }

  return problems;
}
