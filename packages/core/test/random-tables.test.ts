import { describe, expect, it } from 'vitest';
import {
  builtinTables,
  checkIntegrity,
  copyRandomTable,
  createRandomTable,
  entriesFromLines,
  type RandomTable,
  removeEncounter,
  removeNpc,
  reviewAdventure,
  rollInSession,
  rollOnTable,
  rowRange,
  Session,
  startSession,
  tableDie,
  tableRows,
} from '../src';
import { loadExample, nth } from './helpers';

const weather: RandomTable = {
  id: 'table-weather',
  title: 'Weather',
  noRepeat: false,
  entries: [
    { text: 'Sun', weight: 3 },
    { text: 'Rain', weight: 2 },
    { text: 'Storm', weight: 1 },
  ],
};

/** A die that always shows the given number, counting from 0. */
const fixed = (value: number, sides: number) => () => value / sides;

describe('random tables', () => {
  it('gives each entry as many numbers as its weight', () => {
    expect(tableDie(weather)).toBe(6);
    expect(tableRows(weather).map(rowRange)).toEqual(['1–3', '4–5', '6']);
  });

  it('rolls the entry the number falls on', () => {
    expect(rollOnTable(weather, [], fixed(0, 6))).toMatchObject({
      roll: 1,
      entry: { text: 'Sun' },
    });
    expect(rollOnTable(weather, [], fixed(3, 6))).toMatchObject({
      roll: 4,
      entry: { text: 'Rain' },
    });
    expect(rollOnTable(weather, [], fixed(5, 6))).toMatchObject({
      roll: 6,
      entry: { text: 'Storm' },
      reset: false,
    });
    expect(rollOnTable(createRandomTable('Empty'))).toBeUndefined();
  });

  it('skips results that came up when a table must not repeat, then starts over', () => {
    const table = { ...weather, noRepeat: true };
    // Sun and Rain are taken, so every roll lands on the storm.
    expect(rollOnTable(table, ['Sun', 'Rain'], fixed(0, 1))).toMatchObject({
      roll: 6,
      entry: { text: 'Storm' },
      reset: false,
    });
    // A table that does repeat ignores what came up.
    expect(rollOnTable(weather, ['Sun', 'Rain'], fixed(0, 6))?.entry.text).toBe('Sun');

    const adventure = { ...loadExample(), randomTables: [table] };
    let session = startSession(adventure);
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      const rolled = rollInSession(session, table);
      session = rolled.session;
      seen.push(rolled.roll?.entry.text ?? '');
    }
    expect(seen.sort()).toEqual(['Rain', 'Storm', 'Sun']);
    expect(Session.safeParse(session).success).toBe(true);
    const fourth = rollInSession(session, table, fixed(0, 6));
    expect(fourth.roll).toMatchObject({ reset: true, entry: { text: 'Sun' } });
    expect(fourth.session.tableRolls[table.id]).toEqual(['Sun']);
  });

  it('only remembers rolls of tables that must not repeat', () => {
    const session = startSession(loadExample());
    expect(rollInSession(session, weather).session).toBe(session);
  });

  it('reads pasted lines as entries, with numbers in front as weights', () => {
    expect(
      entriesFromLines('1–3. Sun\n4-5: Rain\n\n- Storm\n6\tFog\n2 wolves howl\n  \n7) Snow'),
    ).toEqual([
      { text: 'Sun', weight: 3 },
      { text: 'Rain', weight: 2 },
      { text: 'Storm', weight: 1 },
      { text: 'Fog', weight: 1 },
      { text: '2 wolves howl', weight: 1 },
      { text: 'Snow', weight: 1 },
    ]);
  });

  it('comes with built-in tables in English and German', () => {
    const english = builtinTables('en');
    const german = builtinTables('de-AT');
    expect(english.length).toBeGreaterThan(5);
    expect(german.map((table) => table.id)).toEqual(english.map((table) => table.id));
    expect(nth(german, 0).title).toBe('Wetter');
    expect(builtinTables('fr').map((table) => table.title)).toEqual(
      english.map((table) => table.title),
    );
    for (const table of [...english, ...german]) {
      expect(table.entries.length).toBeGreaterThanOrEqual(6);
      expect(table.entries.every((entry) => entry.text.trim() !== '')).toBe(true);
    }
    for (const [i, table] of english.entries()) {
      expect(nth(german, i).entries.map((e) => e.weight)).toEqual(
        table.entries.map((e) => e.weight),
      );
    }
  });

  it('copies a table under a new id', () => {
    const copy = copyRandomTable(nth(builtinTables(), 0));
    expect(copy.id).toMatch(/^table-/);
    expect(copy.entries).toEqual(nth(builtinTables(), 0).entries);
  });

  it('checks encounters and links of entries and flags tables too short to roll on', () => {
    const adventure = {
      ...loadExample(),
      randomTables: [
        {
          id: 'table-marsh',
          title: 'Marsh',
          noRepeat: false,
          entries: [
            { text: '[The ferryman](npc-brannoc) waves.', weight: 1 },
            { text: 'Something stirs in the water.', weight: 1, encounterId: 'enc-causeway' },
          ],
        },
        { id: 'table-short', title: 'Short', noRepeat: false, entries: [] },
      ],
    };
    expect(checkIntegrity(adventure)).toEqual([]);
    expect(reviewAdventure(adventure)).toContainEqual({
      kind: 'randomTableTooShort',
      tableId: 'table-short',
    });

    const broken = {
      ...adventure,
      randomTables: [{ ...weather, entries: [{ text: 'x', weight: 1, encounterId: 'enc-none' }] }],
    };
    expect(checkIntegrity(broken)).toEqual([
      {
        path: 'randomTables[0].entries[0].encounterId',
        message: 'Unknown encounter "enc-none"',
      },
    ]);

    const withoutFight = removeEncounter(adventure, 'enc-causeway');
    expect(nth(withoutFight.randomTables, 0).entries[1]).toEqual({
      text: 'Something stirs in the water.',
      weight: 1,
    });
    const withoutNpc = removeNpc(adventure, 'npc-brannoc');
    expect(nth(withoutNpc.randomTables, 0).entries[0]?.text).toBe('The ferryman waves.');
  });
});
