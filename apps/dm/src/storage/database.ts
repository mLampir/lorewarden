import { Adventure, Session } from '@lorewarden/core';

// Everything stays in this browser's IndexedDB. Nothing is sent anywhere.
const DB_NAME = 'lorewarden';
const DB_VERSION = 1;

export interface AdventureSummary {
  id: string;
  title: string;
  sceneCount: number;
  updatedAt: string;
}

interface StoredAdventure {
  id: string;
  updatedAt: string;
  adventure: unknown;
}

let connection: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  connection ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('adventures', { keyPath: 'id' });
      const sessions = db.createObjectStore('sessions', { keyPath: 'id' });
      sessions.createIndex('adventureId', 'adventureId');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return connection;
}

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function store(name: 'adventures' | 'sessions', mode: IDBTransactionMode) {
  return (await open()).transaction(name, mode).objectStore(name);
}

/** Drops Vue proxies and undefined fields so the value can be stored. */
function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function readAdventure(record: StoredAdventure | undefined): Adventure | undefined {
  if (!record) return undefined;
  const parsed = Adventure.safeParse(record.adventure);
  return parsed.success ? parsed.data : undefined;
}

export async function listAdventures(): Promise<AdventureSummary[]> {
  const records = await done<StoredAdventure[]>((await store('adventures', 'readonly')).getAll());
  return records
    .flatMap((record) => {
      const adventure = readAdventure(record);
      return adventure
        ? [
            {
              id: adventure.id,
              title: adventure.title,
              sceneCount: adventure.scenes.length,
              updatedAt: record.updatedAt,
            },
          ]
        : [];
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getAdventure(id: string): Promise<Adventure | undefined> {
  const record = await done<StoredAdventure | undefined>(
    (await store('adventures', 'readonly')).get(id),
  );
  return readAdventure(record);
}

/** Refuses to store an invalid adventure, so the last valid version is kept instead. */
export async function saveAdventure(adventure: Adventure): Promise<void> {
  const parsed = Adventure.safeParse(plain(adventure));
  if (!parsed.success) throw new Error('Adventure is not valid');
  const record: StoredAdventure = {
    id: adventure.id,
    updatedAt: new Date().toISOString(),
    adventure: parsed.data,
  };
  await done((await store('adventures', 'readwrite')).put(record));
}

/** Deletes an adventure together with its sessions. */
export async function deleteAdventure(id: string): Promise<void> {
  const db = await open();
  const tx = db.transaction(['adventures', 'sessions'], 'readwrite');
  tx.objectStore('adventures').delete(id);
  const sessions = tx.objectStore('sessions');
  const keys = await done(sessions.index('adventureId').getAllKeys(id));
  for (const key of keys) sessions.delete(key);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getLatestSession(adventureId: string): Promise<Session | undefined> {
  const index = (await store('sessions', 'readonly')).index('adventureId');
  const records = await done<unknown[]>(index.getAll(adventureId));
  return records
    .flatMap((record) => {
      const parsed = Session.safeParse(record);
      return parsed.success ? [parsed.data] : [];
    })
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
}

export async function saveSession(session: Session): Promise<void> {
  const parsed = Session.safeParse(plain(session));
  if (!parsed.success) throw new Error('Session is not valid');
  await done((await store('sessions', 'readwrite')).put(parsed.data));
}
