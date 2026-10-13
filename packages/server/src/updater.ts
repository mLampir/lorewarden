import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AUTH_DIR } from './auth';

/** What the updater container is doing or how its last update ended, see packages/updater. */
export interface UpdaterStatus {
  state: 'idle' | 'running' | 'updated' | 'current' | 'rolled-back' | 'failed';
  step?: 'pulling' | 'backing-up' | 'restarting' | 'checking' | 'rolling-back';
  from?: string;
  to?: string;
  error?: string;
  at: string;
}

/** Shown in the game master app's settings when an updater container is set up. */
export interface UpdaterInfo {
  /** Whether Lorewarden updates itself at night when a new release is out. */
  auto: boolean;
  /** Undefined while the updater cannot be reached. */
  status?: UpdaterStatus;
}

interface SettingsFile {
  auto: boolean;
}

const SETTINGS_FILE = 'updater.json';
const POLL_MS = 3_000;
const AUTO_CHECK_MS = 30 * 60_000;
/** Automatic updates start between 3 and 5 o'clock, in the server's time zone (TZ). */
const NIGHT = { from: 3, to: 5 };

export type StartResult = 'started' | 'busy' | 'unreachable';

/**
 * Talks to the optional updater container, which may replace this server's container.
 *
 * This server never gets the Docker socket. It only asks the updater, which sits in an internal
 * Docker network and wants a shared token, to update now; the updater decides which image.
 */
export class Updater {
  private settings: SettingsFile = { auto: false };
  private status: UpdaterStatus | undefined;
  private readonly file: string;
  private polling: ReturnType<typeof setTimeout> | undefined;
  private autoTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly options: {
      url: string;
      token: string;
      dataDir: string;
      onChange?: (info: UpdaterInfo) => void;
      fetch?: typeof fetch;
    },
  ) {
    this.file = join(options.dataDir, AUTH_DIR, SETTINGS_FILE);
    try {
      if (existsSync(this.file)) {
        const stored = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<SettingsFile>;
        this.settings = { auto: stored.auto === true };
      }
    } catch {
      // A damaged file means the defaults.
    }
  }

  get info(): UpdaterInfo {
    return { auto: this.settings.auto, status: this.status };
  }

  setAuto(auto: boolean): void {
    this.settings = { auto };
    this.save();
    this.changed();
  }

  /** Asks the updater for its status; keeps asking while an update runs. */
  async refresh(): Promise<void> {
    clearTimeout(this.polling);
    this.polling = undefined;
    try {
      const response = await this.call('GET', '/status');
      this.status = response.ok ? ((await response.json()) as UpdaterStatus) : undefined;
    } catch {
      this.status = undefined;
    }
    this.changed();
    if (this.status?.state === 'running') {
      this.polling = setTimeout(() => void this.refresh(), POLL_MS);
      this.polling.unref();
    }
  }

  /** Asks the updater to update now. This server is stopped and replaced while it does. */
  async start(): Promise<StartResult> {
    let response: Response;
    try {
      response = await this.call('POST', '/update');
    } catch {
      return 'unreachable';
    }
    if (response.status === 409) return 'busy';
    if (!response.ok) return 'unreachable';
    await this.refresh();
    return 'started';
  }

  /**
   * Checks every half hour whether to update on its own: when automatic updates are on, a new
   * release is out and it is night.
   */
  watch(latest: () => string | undefined, now = () => new Date()): () => void {
    const run = () => void this.autoUpdate(latest(), now());
    this.autoTimer = setInterval(run, AUTO_CHECK_MS);
    this.autoTimer.unref();
    return () => this.stop();
  }

  /** Starts an automatic update if it is time for one; exposed for tests. */
  async autoUpdate(latest: string | undefined, now: Date): Promise<boolean> {
    if (!this.settings.auto || !latest) return false;
    const hour = now.getHours();
    if (hour < NIGHT.from || hour >= NIGHT.to) return false;
    await this.refresh();
    const status = this.status;
    if (!status || status.state === 'running') return false;
    // A release that did not work is not tried again every night; the button is still there.
    // One whose image was not ready yet ("current") is.
    if ((status.state === 'rolled-back' || status.state === 'failed') && status.to === latest) {
      return false;
    }
    return (await this.start()) === 'started';
  }

  stop(): void {
    clearTimeout(this.polling);
    clearInterval(this.autoTimer);
  }

  private call(method: string, path: string): Promise<Response> {
    const request = this.options.fetch ?? fetch;
    return request(`${this.options.url.replace(/\/+$/, '')}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.options.token}` },
      signal: AbortSignal.timeout(10_000),
    });
  }

  private changed(): void {
    this.options.onChange?.(this.info);
  }

  private save(): void {
    mkdirSync(join(this.options.dataDir, AUTH_DIR), { recursive: true, mode: 0o700 });
    const temporary = `${this.file}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.settings), { mode: 0o600 });
    renameSync(temporary, this.file);
  }
}
