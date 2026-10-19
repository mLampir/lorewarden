/** Where the server looks for new releases. */
export const RELEASES_URL = 'https://api.github.com/repos/mLampir/lorewarden/releases/latest';
const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;

export interface UpdateInfo {
  /** The version this server runs. */
  current: string;
  /** The newest release, when it is newer than the current version. */
  latest?: string;
  /** Release notes of the newest release. */
  url?: string;
  /** Whether the server asks GitHub, so the app can offer to check now. */
  canCheck?: boolean;
}

/** How a check ended: a newer release is out, this is the newest, or GitHub did not answer. */
export type CheckResult = 'newer' | 'current' | 'unreachable';

export interface UpdateWatcher {
  /** Checks right away, e.g. when the game master asks in the settings. */
  check(): Promise<CheckResult>;
  stop(): void;
}

/** Splits "v1.2.3" into [1, 2, 3]; anything that is not a plain version is undefined. */
function parseVersion(version: string): number[] | undefined {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  return match ? match.slice(1).map(Number) : undefined;
}

/** Whether `candidate` is a newer release than `current`. Development builds never update. */
export function isNewer(candidate: string, current: string): boolean {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    const difference = (a[i] ?? 0) - (b[i] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return false;
}

/** Asks GitHub for the newest release; undefined when there is none or GitHub cannot be reached. */
export async function fetchLatestRelease(
  url = RELEASES_URL,
): Promise<{ version: string; url: string } | undefined> {
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'lorewarden-server' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return undefined;
    const release = (await response.json()) as { tag_name?: unknown; html_url?: unknown };
    if (typeof release.tag_name !== 'string' || typeof release.html_url !== 'string') {
      return undefined;
    }
    return { version: release.tag_name.replace(/^v/, ''), url: release.html_url };
  } catch {
    return undefined;
  }
}

/** Checks for a new release now and then every twelve hours; calls `onChange` when one appears. */
export function watchForUpdates(
  current: string,
  onChange: (info: UpdateInfo) => void,
  check = fetchLatestRelease,
): UpdateWatcher {
  let known: string | undefined;
  const run = async (): Promise<CheckResult> => {
    const release = await check();
    if (!release) return 'unreachable';
    if (!isNewer(release.version, current)) return 'current';
    if (release.version !== known) {
      known = release.version;
      onChange({ current, latest: release.version, url: release.url });
    }
    return 'newer';
  };
  void run();
  const timer = setInterval(() => void run(), CHECK_INTERVAL_MS);
  timer.unref();
  return { check: run, stop: () => clearInterval(timer) };
}
