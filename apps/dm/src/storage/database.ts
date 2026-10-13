import { Adventure, type AiSettings, Monster, Party, Session } from '@lorewarden/core';
import { loadAuthStatus } from '../lib/auth';
import { clientId } from '../lib/server';

// Adventures and sessions are kept by the Lorewarden server on this computer, as files in a
// folder. Nothing is sent anywhere else.

export interface AdventureSummary {
  id: string;
  title: string;
  sceneCount: number;
  updatedAt: string;
}

/**
 * Thrown when a save names the version it is based on and something else (an AI assistant, a
 * phone, another tab) saved a newer one meanwhile. Carries the newer one, or undefined when the
 * entry was deleted.
 */
export class ChangedMeanwhile<T> extends Error {
  constructor(readonly current: { value: T; etag: string | undefined } | undefined) {
    super('Changed meanwhile');
  }
}

async function request(
  path: string,
  init: RequestInit & { ifMatch?: string } = {},
): Promise<Response> {
  const { ifMatch, ...rest } = init;
  const response = await fetch(`/api${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      'X-Lorewarden-Client': clientId,
      ...(ifMatch ? { 'If-Match': ifMatch } : {}),
    },
  });
  if (response.status === 412) return response;
  // Signed out meanwhile, e.g. in another tab: the app asks for the password again.
  if (response.status === 401) void loadAuthStatus();
  // A missing entry is no error when reading or deleting it. A save that finds no route, e.g. on
  // an older server still running on the port, must not look as if it worked.
  const missingIsFine = (init.method ?? 'GET') !== 'PUT';
  if (!response.ok && !(response.status === 404 && missingIsFine)) {
    throw new Error(`The Lorewarden server answered ${response.status}`);
  }
  return response;
}

/** Drops Vue proxies and undefined fields so the value can be sent. */
function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export async function listAdventures(): Promise<AdventureSummary[]> {
  const body = (await (await request('/adventures')).json()) as {
    adventures: AdventureSummary[];
  };
  return body.adventures;
}

export async function getAdventure(id: string): Promise<Adventure | undefined> {
  return (await loadAdventure(id))?.adventure;
}

/** An adventure with the ETag of its version, to save changes to it with saveAdventure. */
export async function loadAdventure(
  id: string,
): Promise<{ adventure: Adventure; etag: string | undefined } | undefined> {
  const response = await request(`/adventures/${encodeURIComponent(id)}`);
  if (response.status === 404) return undefined;
  const parsed = Adventure.safeParse(await response.json());
  return parsed.success ? { adventure: parsed.data, etag: etagOf(response) } : undefined;
}

/**
 * Refuses to store an invalid adventure, so the last valid version is kept instead. With the ETag
 * of the version the change is based on, throws ChangedMeanwhile when another one was saved
 * since. Returns the ETag of the saved version.
 */
export async function saveAdventure(
  adventure: Adventure,
  ifMatch?: string,
): Promise<string | undefined> {
  const parsed = Adventure.safeParse(plain(adventure));
  if (!parsed.success) throw new Error('Adventure is not valid');
  const response = await request(`/adventures/${encodeURIComponent(adventure.id)}`, {
    method: 'PUT',
    body: JSON.stringify(parsed.data),
    ifMatch,
  });
  if (response.status === 412) {
    const current = isJson(response) ? Adventure.safeParse(await response.json()) : undefined;
    throw new ChangedMeanwhile(
      current?.success ? { value: current.data, etag: etagOf(response) } : undefined,
    );
  }
  return etagOf(response);
}

/** Deletes an adventure together with its sessions. */
export async function deleteAdventure(id: string): Promise<void> {
  await request(`/adventures/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function getLatestSession(adventureId: string): Promise<Session | undefined> {
  const response = await request(`/adventures/${encodeURIComponent(adventureId)}/session`);
  if (response.status === 404) return undefined;
  const parsed = Session.safeParse(await response.json());
  return parsed.success ? parsed.data : undefined;
}

export async function saveSession(session: Session): Promise<void> {
  const parsed = Session.safeParse(plain(session));
  if (!parsed.success) throw new Error('Session is not valid');
  await request(`/sessions/${encodeURIComponent(session.id)}`, {
    method: 'PUT',
    body: JSON.stringify(parsed.data),
  });
}

/** Tells AI assistants on this computer in which languages to write new adventures. */
export async function saveAiSettings(settings: AiSettings): Promise<void> {
  await request('/settings', { method: 'PUT', body: JSON.stringify(plain(settings)) });
}

/** The game master's own monsters, which every adventure can use. */
export async function listMonsters(): Promise<Monster[]> {
  const body = (await (await request('/monsters')).json()) as { monsters: unknown[] };
  return body.monsters.flatMap((entry) => {
    const parsed = Monster.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Adds a monster to the library or replaces the one with the same id. */
export async function saveLibraryMonster(monster: Monster): Promise<void> {
  const parsed = Monster.safeParse(plain(monster));
  if (!parsed.success) throw new Error('Monster is not valid');
  await request(`/monsters/${encodeURIComponent(monster.id)}`, {
    method: 'PUT',
    body: JSON.stringify(parsed.data),
  });
}

export async function deleteLibraryMonster(id: string): Promise<void> {
  await request(`/monsters/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** The game master's parties of player characters, which every adventure can be played with. */
export async function listParties(): Promise<Party[]> {
  return (await loadParties()).parties;
}

/** The parties with the ETag of their version, which every change to one of them moves on. */
export async function loadParties(): Promise<{ parties: Party[]; etag: string | undefined }> {
  const response = await request('/parties');
  return { parties: readParties(await response.json()), etag: etagOf(response) };
}

/**
 * Saves a party. With the ETag of the parties it was edited from, throws ChangedMeanwhile with
 * the current parties when they changed since, e.g. because a player entered a character on their
 * phone. Returns the ETag of the saved version.
 */
export async function saveParty(party: Party, ifMatch?: string): Promise<string | undefined> {
  const parsed = Party.safeParse(plain(party));
  if (!parsed.success) throw new Error('Party is not valid');
  const response = await request(`/parties/${encodeURIComponent(party.id)}`, {
    method: 'PUT',
    body: JSON.stringify(parsed.data),
    ifMatch,
  });
  if (response.status === 412) {
    throw new ChangedMeanwhile({
      value: readParties(await response.json()),
      etag: etagOf(response),
    });
  }
  return etagOf(response);
}

function readParties(body: unknown): Party[] {
  const entries = (body as { parties?: unknown[] } | undefined)?.parties ?? [];
  return entries.flatMap((entry) => {
    const parsed = Party.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

/** The version of what the server sent; an older server sends none. */
function etagOf(response: Response): string | undefined {
  return response.headers.get('ETag') ?? undefined;
}

function isJson(response: Response): boolean {
  return (response.headers.get('Content-Type') ?? '').includes('json');
}

export async function deleteParty(id: string): Promise<void> {
  await request(`/parties/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
