import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ContainerInfo, Docker, EndpointSettings, ImageInfo } from '../src/docker';
import { containerSpec, recover, update } from '../src/update';

const REFERENCE = 'ghcr.io/example/lorewarden:latest';
const IMAGE_ENV = ['PATH=/usr/local/bin', 'LOREWARDEN_DIR=/data'];

function image(id: string, version: string): ImageInfo {
  return {
    Id: id,
    Config: {
      Env: IMAGE_ENV,
      Labels: { 'org.opencontainers.image.version': version },
      Cmd: ['node', 'server.js'],
      Healthcheck: { Test: ['CMD', 'true'] },
    },
  };
}

function lorewarden(id: string, imageId: string): ContainerInfo {
  return {
    Id: id,
    Name: '/lorewarden',
    Image: imageId,
    Config: {
      Image: REFERENCE,
      Hostname: id.slice(0, 12),
      Env: [...IMAGE_ENV, 'LOREWARDEN_TRUST_PROXY=1'],
      Labels: {
        'org.opencontainers.image.version': '1.0.0',
        'com.docker.compose.service': 'lorewarden',
      },
      Cmd: ['node', 'server.js'],
      Healthcheck: { Test: ['CMD', 'true'] },
    },
    HostConfig: { NetworkMode: 'site_default', Binds: ['/srv/adventures:/data'] },
    NetworkSettings: {
      Networks: {
        site_default: { Aliases: ['lorewarden', id.slice(0, 12)], NetworkID: 'n1' },
        site_updater: { Aliases: ['lorewarden'], NetworkID: 'n2' },
      },
    },
    State: { Status: 'running', Running: true, Restarting: false, ExitCode: 0 },
  };
}

/** Keeps containers and images in memory, like a tiny Docker. */
class FakeDocker implements Docker {
  containers = new Map<string, ContainerInfo & { name: string }>();
  images = new Map<string, ImageInfo>();
  tags = new Map<string, string>();
  /** The image ID that pulling REFERENCE yields. */
  remote = 'sha256:old';
  /** Health of containers created from now on. */
  health = 'healthy';
  created: Record<string, unknown>[] = [];
  connected: [string, string, EndpointSettings][] = [];
  removedImages: string[] = [];
  private next = 1;

  constructor() {
    this.images.set('sha256:old', image('sha256:old', '1.0.0'));
    this.images.set('sha256:new', image('sha256:new', '1.1.0'));
    this.tags.set(REFERENCE, 'sha256:old');
    this.containers.set('c-old', { ...lorewarden('c-old', 'sha256:old'), name: 'lorewarden' });
  }

  private find(nameOrId: string) {
    return [...this.containers.values()].find((c) => c.Id === nameOrId || c.name === nameOrId);
  }

  async container(nameOrId: string) {
    return this.find(nameOrId);
  }
  async image(reference: string) {
    return this.images.get(this.tags.get(reference) ?? reference);
  }
  async pull(reference: string) {
    this.tags.set(reference, this.remote);
  }
  async tag(id: string, reference: string) {
    this.tags.set(reference, id);
  }
  async stop(id: string) {
    const c = this.find(id);
    if (c) c.State = { ...c.State, Running: false, Status: 'exited' };
  }
  async start(id: string) {
    const c = this.find(id);
    if (!c) throw new Error('no such container');
    c.State = { ...c.State, Running: true, Status: 'running' };
  }
  async rename(id: string, name: string) {
    const c = this.find(id);
    if (!c) throw new Error('no such container');
    if (this.find(name)) throw new Error('name in use');
    c.name = name;
  }
  async remove(id: string) {
    const c = this.find(id);
    if (c) this.containers.delete(c.Id);
  }
  async create(name: string, body: Record<string, unknown>) {
    if (this.find(name)) throw new Error('name in use');
    this.created.push(body);
    const id = `c-new-${this.next++}`;
    const imageId = this.tags.get(String(body.Image)) ?? '';
    this.containers.set(id, {
      ...lorewarden(id, imageId),
      name,
      State: {
        Status: 'created',
        Running: false,
        Restarting: false,
        ExitCode: 0,
        Health: { Status: this.health },
      },
    });
    return id;
  }
  async connect(network: string, container: string, endpoint: EndpointSettings) {
    this.connected.push([network, container, endpoint]);
  }
  async removeImage(id: string) {
    this.removedImages.push(id);
  }
}

let docker: FakeDocker;
let dataDir: string;
let backupsDir: string;

beforeEach(async () => {
  docker = new FakeDocker();
  const root = await mkdtemp(join(tmpdir(), 'lorewarden-updater-'));
  dataDir = join(root, 'data');
  backupsDir = join(root, 'backups');
  await mkdir(dataDir);
  await writeFile(join(dataDir, 'tavern.adventure.json'), 'before');
});

const run = () =>
  update({
    docker,
    container: 'lorewarden',
    dataDir,
    backupsDir,
    keepBackups: 2,
    pollMs: 1,
    healthTimeoutMs: 50,
    now: () => new Date('2026-10-13T03:00:00Z'),
  });

describe('update', () => {
  it('does nothing when the image has not changed', async () => {
    const status = await run();
    expect(status).toMatchObject({ state: 'current', from: '1.0.0' });
    expect(docker.created).toHaveLength(0);
    expect(await container('lorewarden')).toMatchObject({ Id: 'c-old' });
  });

  it('backs up, replaces the container and removes the old one', async () => {
    docker.remote = 'sha256:new';
    const steps: string[] = [];
    const status = await update({
      docker,
      container: 'lorewarden',
      dataDir,
      backupsDir,
      keepBackups: 2,
      pollMs: 1,
      onStep: (step) => steps.push(step),
    });
    expect(status).toMatchObject({ state: 'updated', from: '1.0.0', to: '1.1.0' });
    expect(steps).toEqual(['pulling', 'backing-up', 'restarting', 'checking']);
    const current = await container('lorewarden');
    expect(current?.Id).toBe('c-new-1');
    expect(current?.State.Running).toBe(true);
    expect(await container('c-old')).toBeUndefined();
    expect(docker.removedImages).toEqual(['sha256:old']);
    const [backup] = await readdir(backupsDir);
    expect(backup).toMatch(/_1\.0\.0$/);
    expect(await readFile(join(backupsDir, backup ?? '', 'tavern.adventure.json'), 'utf8')).toBe(
      'before',
    );
    // The second network is connected after the container was created.
    expect(docker.connected).toEqual([
      ['site_updater', 'c-new-1', expect.objectContaining({ Aliases: ['lorewarden'] })],
    ]);
  });

  it('goes back to the old version and its data when the new one is unhealthy', async () => {
    docker.remote = 'sha256:new';
    docker.health = 'unhealthy';
    // The new version changes the data before it fails.
    const originalStart = docker.start.bind(docker);
    docker.start = async (id: string) => {
      if (id.startsWith('c-new')) await writeFile(join(dataDir, 'tavern.adventure.json'), 'after');
      return originalStart(id);
    };
    const status = await run();
    expect(status).toMatchObject({ state: 'rolled-back', from: '1.0.0', to: '1.1.0' });
    expect(status.error).toMatch(/unhealthy/);
    const current = await container('lorewarden');
    expect(current?.Id).toBe('c-old');
    expect(current?.State.Running).toBe(true);
    expect(docker.containers.size).toBe(1);
    expect(await readFile(join(dataDir, 'tavern.adventure.json'), 'utf8')).toBe('before');
    expect(docker.removedImages).toEqual([]);
    expect(docker.tags.get(REFERENCE)).toBe('sha256:old');
  });

  it('rolls back when the new version does not become healthy in time', async () => {
    docker.remote = 'sha256:new';
    docker.health = 'starting';
    const status = await run();
    expect(status.state).toBe('rolled-back');
    expect((await container('lorewarden'))?.Id).toBe('c-old');
  });

  it('starts the old container again when pulling fails', async () => {
    docker.pull = async () => {
      throw new Error('registry unreachable');
    };
    const status = await run();
    expect(status).toMatchObject({ state: 'failed', error: 'registry unreachable' });
    expect((await container('lorewarden'))?.State.Running).toBe(true);
  });

  it('refuses images pinned to a digest', async () => {
    const old = await container('lorewarden');
    if (old) old.Config.Image = 'ghcr.io/example/lorewarden@sha256:abc';
    const status = await run();
    expect(status.state).toBe('failed');
    expect(status.error).toMatch(/digest/);
  });

  it('keeps only the newest backups', async () => {
    docker.remote = 'sha256:new';
    for (const name of ['2026-01-01T00-00-00Z_0.8.0', '2026-02-01T00-00-00Z_0.9.0']) {
      await mkdir(join(backupsDir, name), { recursive: true });
    }
    await run();
    expect(await readdir(backupsDir)).toEqual([
      '2026-02-01T00-00-00Z_0.9.0',
      '2026-10-13T03-00-00Z_1.0.0',
    ]);
  });
});

describe('containerSpec', () => {
  it('keeps what was configured and leaves what came from the image to the new image', () => {
    const old = lorewarden('c-old-0123456789', 'sha256:old');
    const { body, extraNetworks } = containerSpec(
      old,
      image('sha256:old', '1.0.0'),
      image('sha256:new', '1.1.0'),
      REFERENCE,
    );
    expect(body.Image).toBe(REFERENCE);
    expect(body.Env).toEqual(['LOREWARDEN_TRUST_PROXY=1']);
    expect(body.Labels).toEqual({ 'com.docker.compose.service': 'lorewarden' });
    expect(body).not.toHaveProperty('Cmd');
    expect(body).not.toHaveProperty('Healthcheck');
    expect(body).not.toHaveProperty('Hostname');
    expect(body.HostConfig).toEqual(old.HostConfig);
    expect(body.NetworkingConfig).toEqual({
      EndpointsConfig: {
        site_default: { Aliases: ['lorewarden'], Links: null, IPAMConfig: null, DriverOpts: null },
      },
    });
    expect(extraNetworks.map(([name]) => name)).toEqual(['site_updater']);
  });

  it('keeps a command that was set for the container', () => {
    const old = lorewarden('c-old', 'sha256:old');
    old.Config.Cmd = ['node', 'server.js', '--trust-proxy'];
    const { body } = containerSpec(
      old,
      image('sha256:old', '1.0.0'),
      image('sha256:new', '1.1.0'),
      REFERENCE,
    );
    expect(body.Cmd).toEqual(['node', 'server.js', '--trust-proxy']);
  });
});

describe('containerSpec and Docker Compose', () => {
  const platform = { architecture: 'arm64', os: 'linux', variant: 'v8' };
  const newImage: ImageInfo = {
    ...image('sha256:index', '1.1.0'),
    Manifests: [
      {
        ID: 'sha256:amd64',
        Kind: 'image',
        Available: true,
        ImageData: { Platform: { architecture: 'amd64', os: 'linux' } },
      },
      { ID: 'sha256:arm64', Kind: 'image', Available: true, ImageData: { Platform: platform } },
    ],
  };

  it('notes the new image the way Compose does, so it does not recreate the container', () => {
    const old = lorewarden('c-old', 'sha256:old');
    old.Config.Labels = { ...old.Config.Labels, 'com.docker.compose.image': 'sha256:old-arm64' };
    old.ImageManifestDescriptor = { digest: 'sha256:old-arm64', platform };
    const { body } = containerSpec(old, image('sha256:old', '1.0.0'), newImage, REFERENCE);
    expect(body.Labels).toMatchObject({ 'com.docker.compose.image': 'sha256:arm64' });

    // Without the containerd image store, Compose notes the image ID.
    delete old.ImageManifestDescriptor;
    const classic = containerSpec(old, image('sha256:old', '1.0.0'), newImage, REFERENCE);
    expect(classic.body.Labels).toMatchObject({ 'com.docker.compose.image': 'sha256:index' });
  });
});

describe('recover', () => {
  it('brings the old container back when the update stopped halfway', async () => {
    await docker.rename('c-old', 'lorewarden-previous');
    await docker.stop('c-old');
    expect(await recover(docker, 'lorewarden')).toBe(true);
    expect(await container('lorewarden')).toMatchObject({ Id: 'c-old' });
    expect((await container('lorewarden'))?.State.Running).toBe(true);
  });

  it('leaves things alone otherwise', async () => {
    expect(await recover(docker, 'lorewarden')).toBe(false);
  });
});

function container(name: string) {
  return docker.container(name);
}
