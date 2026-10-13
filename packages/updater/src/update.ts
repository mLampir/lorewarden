import { isDeepStrictEqual } from 'node:util';
import { backUp, backupName, pruneBackups, restore } from './backup';
import {
  type ContainerInfo,
  type Docker,
  type EndpointSettings,
  type ImageInfo,
  splitReference,
} from './docker';

export type UpdateState = 'idle' | 'running' | 'updated' | 'current' | 'rolled-back' | 'failed';
export type UpdateStep = 'pulling' | 'backing-up' | 'restarting' | 'checking' | 'rolling-back';

/** What the updater is doing or how the last update ended; Lorewarden shows it in its settings. */
export interface UpdateStatus {
  state: UpdateState;
  step?: UpdateStep;
  /** Version before the update, from the image's label. */
  from?: string;
  /** Version after the update. */
  to?: string;
  /** Why the update failed or was rolled back. */
  error?: string;
  /** When this state began, as an ISO date. */
  at: string;
}

export interface UpdateOptions {
  docker: Docker;
  /** Name of the Lorewarden container. */
  container: string;
  /** Lorewarden's data folder, mounted into the updater as well. */
  dataDir: string;
  /** Where backups of the data folder go. */
  backupsDir: string;
  /** How many backups to keep. */
  keepBackups: number;
  /** How long the new container may take to report itself healthy. */
  healthTimeoutMs?: number;
  /** For containers without a health check: how long they must keep running. */
  runningMs?: number;
  pollMs?: number;
  now?: () => Date;
  /** Called at each step, so the status can be asked for while the update runs. */
  onStep?: (step: UpdateStep, versions: { from?: string; to?: string }) => void;
}

const VERSION_LABEL = 'org.opencontainers.image.version';
/** Docker Compose recreates a container whose image differs from this label. */
const COMPOSE_IMAGE_LABEL = 'com.docker.compose.image';
/** Image settings a container takes over unless it was given its own. */
const IMAGE_DEFAULTS = [
  'Cmd',
  'Entrypoint',
  'Healthcheck',
  'WorkingDir',
  'User',
  'ExposedPorts',
  'Volumes',
  'StopSignal',
  'Shell',
  'OnBuild',
];

function version(image: ImageInfo | undefined): string | undefined {
  return image?.Config.Labels?.[VERSION_LABEL];
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Name the old container has while the new one starts. */
export function previousName(container: string): string {
  return `${container}-previous`;
}

/**
 * How to create a container like `old`, but from the newly pulled image.
 *
 * Settings that `old` only had because its image set them (environment variables, labels, the
 * command, the health check …) are left out, so the new image's own settings apply. Everything
 * given in compose.yaml or to docker run stays. Docker accepts one network when it creates a
 * container; the others are connected afterwards.
 */
export function containerSpec(
  old: ContainerInfo,
  oldImage: ImageInfo | undefined,
  newImage: ImageInfo,
  reference: string,
): { body: Record<string, unknown>; extraNetworks: [string, EndpointSettings][] } {
  const config: Record<string, unknown> = { ...old.Config, Image: reference };
  const imageConfig = oldImage?.Config ?? {};
  // Docker names a container's host after its ID unless one was given.
  if (old.Config.Hostname && old.Id.startsWith(old.Config.Hostname)) delete config.Hostname;
  const imageEnv = new Set(imageConfig.Env ?? []);
  config.Env = (old.Config.Env ?? []).filter((entry) => !imageEnv.has(entry));
  const imageLabels = imageConfig.Labels ?? {};
  config.Labels = Object.fromEntries(
    Object.entries(old.Config.Labels ?? {}).filter(([key, value]) => imageLabels[key] !== value),
  );
  if (old.Config.Labels?.[COMPOSE_IMAGE_LABEL]) {
    // Keeps "docker compose up -d" from recreating the container once more.
    (config.Labels as Record<string, string>)[COMPOSE_IMAGE_LABEL] = imageDigest(old, newImage);
  }
  for (const key of IMAGE_DEFAULTS) {
    if (isDeepStrictEqual(config[key] ?? null, imageConfig[key] ?? null)) delete config[key];
  }

  const networks = Object.entries(old.NetworkSettings.Networks ?? {}).map(
    ([name, endpoint]): [string, EndpointSettings] => [
      name,
      {
        // Docker adds the container's short ID as an alias by itself.
        Aliases: [...new Set(endpoint.Aliases ?? [])].filter((alias) => !old.Id.startsWith(alias)),
        Links: endpoint.Links ?? null,
        IPAMConfig: endpoint.IPAMConfig ?? null,
        DriverOpts: endpoint.DriverOpts ?? null,
      },
    ],
  );
  const mode = String(old.HostConfig.NetworkMode ?? '');
  const ownNetwork = mode === 'host' || mode === 'none' || mode.startsWith('container:');
  const first = ownNetwork ? undefined : (networks.find(([name]) => name === mode) ?? networks[0]);
  const body: Record<string, unknown> = { ...config, HostConfig: old.HostConfig };
  if (first) body.NetworkingConfig = { EndpointsConfig: { [first[0]]: first[1] } };
  return {
    body,
    extraNetworks: first ? networks.filter(([name]) => name !== first[0]) : [],
  };
}

/**
 * The image digest Docker Compose notes on its containers: the platform's manifest with the
 * containerd image store, otherwise the image ID.
 */
function imageDigest(old: ContainerInfo, image: ImageInfo): string {
  const platform = old.ImageManifestDescriptor?.platform;
  if (!platform) return image.Id;
  const manifest = image.Manifests?.find(
    ({ Kind, Available, ImageData }) =>
      Kind === 'image' &&
      Available &&
      ImageData?.Platform?.os === platform.os &&
      ImageData?.Platform?.architecture === platform.architecture &&
      (ImageData?.Platform?.variant ?? '') === (platform.variant ?? ''),
  );
  return manifest?.ID ?? image.Id;
}

/** Waits until the container reports itself healthy, or keeps running if it has no check. */
async function waitUntilHealthy(docker: Docker, id: string, options: UpdateOptions): Promise<void> {
  const timeout = options.healthTimeoutMs ?? 180_000;
  const runningMs = options.runningMs ?? 20_000;
  const pollMs = options.pollMs ?? 2_000;
  const started = Date.now();
  for (;;) {
    const info = await docker.container(id);
    if (!info) throw new Error('The new container disappeared.');
    const { State } = info;
    if (!State.Running || State.Restarting) {
      throw new Error(`The new version stopped with exit code ${State.ExitCode}.`);
    }
    if (State.Health?.Status === 'healthy') return;
    if (State.Health?.Status === 'unhealthy') throw new Error('The new version is unhealthy.');
    const elapsed = Date.now() - started;
    if (!State.Health && elapsed >= runningMs) return;
    if (elapsed >= timeout) throw new Error('The new version did not become healthy in time.');
    await sleep(pollMs);
  }
}

/**
 * Updates the Lorewarden container to the newest image of its tag.
 *
 * Pulls the image while the old version still runs, stops it, backs up the data folder, starts a
 * new container with the same settings and waits until it is healthy. If it is not, the new
 * container goes, the backup comes back and the old container starts again.
 */
export async function update(options: UpdateOptions): Promise<UpdateStatus> {
  const { docker, container: name } = options;
  const now = options.now ?? (() => new Date());
  const result = (state: UpdateState, extra: Partial<UpdateStatus> = {}): UpdateStatus => ({
    state,
    ...extra,
    at: now().toISOString(),
  });

  let old: ContainerInfo | undefined;
  let from: string | undefined;
  let to: string | undefined;
  try {
    old = await docker.container(name);
    if (!old) return result('failed', { error: `There is no container named "${name}".` });
    const reference = old.Config.Image;
    splitReference(reference);
    const oldImage = await docker.image(old.Image);
    from = version(oldImage);

    options.onStep?.('pulling', { from });
    await docker.pull(reference);
    const newImage = await docker.image(reference);
    if (!newImage) throw new Error(`The image ${reference} is missing after pulling it.`);
    to = version(newImage);
    if (newImage.Id === old.Image) return result('current', { from });

    options.onStep?.('backing-up', { from, to });
    await docker.stop(old.Id);
    let backup: string;
    try {
      backup = await backUp(
        options.dataDir,
        options.backupsDir,
        backupName(now(), from ?? old.Image.replace(/^sha256:/, '').slice(0, 12)),
      );
    } catch (error) {
      await docker.start(old.Id);
      throw error;
    }

    options.onStep?.('restarting', { from, to });
    const leftover = await docker.container(previousName(name));
    if (leftover && leftover.Id !== old.Id) await docker.remove(leftover.Id);
    await docker.rename(old.Id, previousName(name));
    let newId: string | undefined;
    try {
      const { body, extraNetworks } = containerSpec(old, oldImage, newImage, reference);
      newId = await docker.create(name, body);
      for (const [network, endpoint] of extraNetworks) {
        await docker.connect(network, newId, endpoint);
      }
      await docker.start(newId);
      options.onStep?.('checking', { from, to });
      await waitUntilHealthy(docker, newId, options);
    } catch (error) {
      options.onStep?.('rolling-back', { from, to });
      try {
        if (newId) await docker.remove(newId);
        // Otherwise "docker compose up -d" would start the failed version again.
        await docker.tag(old.Image, reference);
        await restore(backup, options.dataDir);
        await docker.rename(old.Id, name);
        await docker.start(old.Id);
      } catch (rollbackError) {
        return result('failed', {
          from,
          to,
          error: `${message(error)} Going back failed too: ${message(rollbackError)}`,
        });
      }
      return result('rolled-back', { from, to, error: message(error) });
    }

    await docker.remove(old.Id);
    // The old image is no longer needed; another container may still use it, though.
    await docker.removeImage(old.Image).catch(() => undefined);
    await pruneBackups(options.backupsDir, options.keepBackups).catch(() => undefined);
    return result('updated', { from, to });
  } catch (error) {
    // Before the old container was renamed: make sure it runs again.
    if (old) await docker.start(old.Id).catch(() => undefined);
    return result('failed', { from, to, error: message(error) });
  }
}

/**
 * After the updater itself was stopped in the middle of an update: brings the old container back
 * if the new one was never created.
 */
export async function recover(docker: Docker, name: string): Promise<boolean> {
  const previous = await docker.container(previousName(name));
  if (!previous || (await docker.container(name))) return false;
  await docker.rename(previous.Id, name);
  await docker.start(previous.Id);
  return true;
}
