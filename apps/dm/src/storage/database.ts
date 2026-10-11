import { Adventure, type AiSettings, Monster, Session } from '@lorewarden/core';
import { clientId } from '../lib/server';

// Adventures and sessions are kept by the Lorewarden server on this computer, as files in a
// folder. Nothing is sent anywhere else.

export interface AdventureSummary {
  id: string;
  title: string;
  sceneCount: number;
  updatedAt: string;
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'X-Lorewarden-Client': clientId },
  });
  if (!response.ok && response.status !== 404) {
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
  const response = await request(`/adventures/${encodeURIComponent(id)}`);
  if (response.status === 404) return undefined;
  const parsed = Adventure.safeParse(await response.json());
  return parsed.success ? parsed.data : undefined;
}

/** Refuses to store an invalid adventure, so the last valid version is kept instead. */
export async function saveAdventure(adventure: Adventure): Promise<void> {
  const parsed = Adventure.safeParse(plain(adventure));
  if (!parsed.success) throw new Error('Adventure is not valid');
  await request(`/adventures/${encodeURIComponent(adventure.id)}`, {
    method: 'PUT',
    body: JSON.stringify(parsed.data),
  });
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
