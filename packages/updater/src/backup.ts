import { chown, cp, lstat, mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

/** Folder name of a backup, e.g. 2026-10-13T03-00-00Z_0.2.0; sorts by time. */
export function backupName(date: Date, version: string | undefined): string {
  const time = date
    .toISOString()
    .replace(/\.\d+Z$/, 'Z')
    .replaceAll(':', '-');
  const safeVersion = (version ?? 'unknown').replace(/[^\w.-]/g, '_');
  return `${time}_${safeVersion}`;
}

/** Copies the data folder into a new folder in `backupsDir` and returns its path. */
export async function backUp(dataDir: string, backupsDir: string, name: string): Promise<string> {
  const target = join(backupsDir, name);
  await mkdir(backupsDir, { recursive: true });
  await cp(dataDir, target, { recursive: true, errorOnExist: true, force: false });
  return target;
}

/**
 * Puts a backup back in place of the data folder's contents. The data folder itself stays, as it
 * is usually mounted into both containers. The files belong to the data folder's owner again,
 * so Lorewarden, which does not run as root, can write them.
 */
export async function restore(backup: string, dataDir: string): Promise<void> {
  for (const entry of await readdir(dataDir)) {
    await rm(join(dataDir, entry), { recursive: true, force: true });
  }
  await cp(backup, dataDir, { recursive: true });
  const { uid, gid } = await lstat(dataDir);
  await chownTree(dataDir, uid, gid);
}

async function chownTree(path: string, uid: number, gid: number): Promise<void> {
  await chown(path, uid, gid);
  if (!(await lstat(path)).isDirectory()) return;
  for (const entry of await readdir(path)) await chownTree(join(path, entry), uid, gid);
}

/** Deletes all but the newest `keep` backups. */
export async function pruneBackups(backupsDir: string, keep: number): Promise<void> {
  const entries = await readdir(backupsDir, { withFileTypes: true });
  const backups = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const name of backups.slice(0, Math.max(0, backups.length - keep))) {
    await rm(join(backupsDir, name), { recursive: true, force: true });
  }
}
