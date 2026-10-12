import { describe, expect, it } from 'vitest';
import { parseBold, parseNotes } from '../src';

describe('parseNotes', () => {
  it('turns lines starting with a dash into one bullet list', () => {
    expect(parseNotes('- **Apprentice** lies\n- **Footprints** by the river')).toEqual([
      {
        kind: 'list',
        items: [
          [{ text: 'Apprentice', bold: true }, { text: ' lies' }],
          [{ text: 'Footprints', bold: true }, { text: ' by the river' }],
        ],
      },
    ]);
  });

  it('keeps prose as paragraphs next to lists', () => {
    expect(parseNotes('First line\nsecond line\n\n* one\n• two\nAfter')).toEqual([
      { kind: 'paragraph', lines: [[{ text: 'First line' }], [{ text: 'second line' }]] },
      { kind: 'list', items: [[{ text: 'one' }], [{ text: 'two' }]] },
      { kind: 'paragraph', lines: [[{ text: 'After' }]] },
    ]);
  });

  it('starts a new paragraph after an empty line', () => {
    expect(parseNotes('One\n\n\nTwo')).toEqual([
      { kind: 'paragraph', lines: [[{ text: 'One' }]] },
      { kind: 'paragraph', lines: [[{ text: 'Two' }]] },
    ]);
  });

  it('returns nothing for empty notes', () => {
    expect(parseNotes('  \n')).toEqual([]);
  });

  it('leaves HTML and other Markdown as plain text', () => {
    expect(parseNotes('# <b>Hi</b>')).toEqual([
      { kind: 'paragraph', lines: [[{ text: '# <b>Hi</b>' }]] },
    ]);
  });
});

describe('parseBold', () => {
  it('ignores asterisks next to a space, like Markdown', () => {
    expect(parseBold('2 ** 3 and **bold** end')).toEqual([
      { text: '2 ** 3 and ' },
      { text: 'bold', bold: true },
      { text: ' end' },
    ]);
    expect(parseBold('**a** **b c**')).toEqual([
      { text: 'a', bold: true },
      { text: ' ' },
      { text: 'b c', bold: true },
    ]);
    expect(parseBold('a **** b')).toEqual([{ text: 'a **** b' }]);
    expect(parseBold('')).toEqual([{ text: '' }]);
  });
});
