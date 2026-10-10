import { readFileSync } from 'node:fs';
import { type Adventure, parseAdventure } from '../src';

export const example = readFileSync(
  new URL('../../../examples/lantern-in-the-marsh.adventure.json', import.meta.url),
  'utf8',
);

export function loadExample(): Adventure {
  const result = parseAdventure(example);
  if (!result.ok) throw new Error(JSON.stringify(result.problems, null, 2));
  return result.adventure;
}

/** Returns list[index] and fails the test if it does not exist. */
export function nth<T>(list: T[], index: number): T {
  const entry = list[index];
  if (entry === undefined) throw new Error(`No entry at index ${index}`);
  return entry;
}
