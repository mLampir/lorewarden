import { describe, expect, it } from 'vitest';
import {
  addReveal,
  addSceneAsset,
  createJoinCode,
  decodeDataUrl,
  forgetPlayer,
  hideReveal,
  JoinCode,
  joinPlayer,
  playerView,
  Session,
  startSession,
  TableState,
  tableState,
} from '../src';
import { loadExample, nth } from './helpers';

const now = new Date('2026-01-01T18:00:00Z');
const later = new Date('2026-01-01T18:05:00Z');
const wren = { id: 'player-wren', name: 'Wren' };
const ash = { id: 'player-ash', name: 'Ash' };
const pixel = 'data:image/png;base64,iVBORw0KGgo=';
const code = 'K7QM2X';

function setup() {
  const adventure = addSceneAsset(loadExample(), 'scene-ferry', {
    kind: 'handout',
    title: 'Torn letter',
    mimeType: 'image/png',
    src: pixel,
  });
  const assetId = nth(adventure.assets, adventure.assets.length - 1).id;
  let session = startSession(adventure, undefined, now);
  session = joinPlayer(joinPlayer(session, wren), ash);
  return { adventure, assetId, session };
}

describe('the table', () => {
  it('creates join codes that are easy to type', () => {
    for (let i = 0; i < 50; i++) expect(JoinCode.safeParse(createJoinCode()).success).toBe(true);
    expect(JoinCode.safeParse('K7QM2O').success).toBe(false);
  });

  it('remembers players and their new names', () => {
    let { session } = setup();
    expect(joinPlayer(session, wren)).toBe(session);
    session = joinPlayer(session, { id: wren.id, name: 'Wren the Bold' });
    expect(session.players).toEqual([{ id: wren.id, name: 'Wren the Bold' }, ash]);
    expect(Session.safeParse(session).success).toBe(true);
  });

  it('reveals to everyone or to some players and hides again', () => {
    let { adventure, assetId, session } = setup();
    session = addReveal(session, { kind: 'asset', assetId, to: 'all' }, now);
    session = addReveal(
      session,
      { kind: 'text', title: ' Secret ', text: ' You recognise the seal. ', to: [wren.id] },
      later,
    );
    session = addReveal(session, { kind: 'text', text: '   ', to: 'all' }, later);
    session = addReveal(session, { kind: 'text', text: 'Nobody', to: [] }, later);
    expect(session.revealed).toHaveLength(2);
    expect(Session.safeParse(session).success).toBe(true);

    const state = tableState(adventure, session, code, 'Hint');
    expect(TableState.safeParse(state).success).toBe(true);
    expect(state.reveals[0]).toMatchObject({
      title: 'Torn letter',
      image: { mimeType: 'image/png', src: pixel },
    });
    expect(state.reveals[1]).toMatchObject({ title: 'Secret', text: 'You recognise the seal.' });

    const url = (id: string) => `/image/${id}`;
    const wrenView = playerView(state, wren, url);
    expect(wrenView.reveals.map((r) => r.title)).toEqual(['Secret', 'Torn letter']);
    expect(wrenView.reveals[0]?.personal).toBe(true);
    expect(wrenView.reveals[1]).toMatchObject({ personal: false, imageUrl: expect.any(String) });
    expect(playerView(state, ash, url).reveals.map((r) => r.title)).toEqual(['Torn letter']);

    session = hideReveal(session, nth(session.revealed, 0).id);
    expect(tableState(adventure, session, code).reveals.map((r) => r.title)).toEqual(['Secret']);
  });

  it('skips images the adventure no longer has', () => {
    const { adventure, session } = setup();
    const withMissing = addReveal(session, { kind: 'asset', assetId: 'asset-gone', to: 'all' });
    expect(tableState(adventure, withMissing, code).reveals).toEqual([]);
  });

  it('drops reveals meant only for a player who is forgotten', () => {
    let { session } = setup();
    session = addReveal(session, { kind: 'text', text: 'Only Wren', to: [wren.id] }, now);
    session = addReveal(session, { kind: 'text', text: 'Both', to: [wren.id, ash.id] }, now);
    session = forgetPlayer(session, wren.id);
    expect(session.players).toEqual([ash]);
    expect(session.revealed.map((r) => [r.text, r.to])).toEqual([['Both', [ash.id]]]);
  });

  it('keeps players and reveals in the next session', () => {
    let { adventure, session } = setup();
    session = addReveal(session, { kind: 'text', text: 'A map of the marsh', to: 'all' }, now);
    const next = startSession(adventure, session, later);
    expect(next.players).toEqual(session.players);
    expect(next.revealed).toEqual(session.revealed);
  });

  it('decodes data URLs', () => {
    const decoded = decodeDataUrl(pixel);
    expect(decoded?.mimeType).toBe('image/png');
    expect([...(decoded?.bytes ?? [])].slice(0, 4)).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(decodeDataUrl('data:image/svg+xml,%3Csvg%2F%3E')?.bytes).toEqual(
      new TextEncoder().encode('<svg/>'),
    );
    expect(decodeDataUrl('https://example.com/a.png')).toBeUndefined();
    const svg = decodeDataUrl(`data:image/svg+xml;charset=utf-8;base64,${btoa('<svg/>')}`);
    expect(svg?.mimeType).toBe('image/svg+xml');
    expect(svg?.bytes).toEqual(new TextEncoder().encode('<svg/>'));
  });
});
