import { request } from 'node:http';

/** The parts of `docker inspect` of a container that the updater uses. */
export interface ContainerInfo {
  Id: string;
  Name: string;
  /** The image ID the container runs. */
  Image: string;
  Config: ContainerConfig;
  HostConfig: Record<string, unknown>;
  NetworkSettings: { Networks?: Record<string, EndpointSettings> };
  State: {
    Status: string;
    Running: boolean;
    Restarting: boolean;
    ExitCode: number;
    Health?: { Status: string };
  };
  /** The platform's manifest of the image, with Docker's containerd image store. */
  ImageManifestDescriptor?: { digest: string; platform?: Platform };
}

export interface Platform {
  architecture?: string;
  os?: string;
  variant?: string;
}

export interface ContainerConfig {
  /** The image reference the container was created from, e.g. ghcr.io/mlampir/lorewarden:0.2. */
  Image: string;
  Hostname?: string;
  Env?: string[] | null;
  Labels?: Record<string, string> | null;
  [key: string]: unknown;
}

export interface EndpointSettings {
  Aliases?: string[] | null;
  Links?: string[] | null;
  IPAMConfig?: unknown;
  DriverOpts?: Record<string, string> | null;
  [key: string]: unknown;
}

/** The parts of `docker image inspect` that the updater uses. */
export interface ImageInfo {
  Id: string;
  Config: {
    Env?: string[] | null;
    Labels?: Record<string, string> | null;
    [key: string]: unknown;
  };
  /** One per platform, with Docker's containerd image store. */
  Manifests?: {
    ID: string;
    Kind: string;
    Available: boolean;
    ImageData?: { Platform?: Platform };
  }[];
}

/** What the updater needs from Docker; tests pass a fake. */
export interface Docker {
  container(name: string): Promise<ContainerInfo | undefined>;
  image(reference: string): Promise<ImageInfo | undefined>;
  pull(reference: string): Promise<void>;
  tag(id: string, reference: string): Promise<void>;
  stop(id: string): Promise<void>;
  start(id: string): Promise<void>;
  rename(id: string, name: string): Promise<void>;
  remove(id: string): Promise<void>;
  create(name: string, body: Record<string, unknown>): Promise<string>;
  connect(network: string, container: string, endpoint: EndpointSettings): Promise<void>;
  removeImage(id: string): Promise<void>;
}

export class DockerError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Splits ghcr.io/mlampir/lorewarden:0.2 into repository and tag; the tag defaults to latest. */
export function splitReference(reference: string): { repository: string; tag: string } {
  if (reference.includes('@')) {
    throw new Error(`The image ${reference} is pinned to a digest, so there is nothing to pull.`);
  }
  const slash = reference.lastIndexOf('/');
  const colon = reference.lastIndexOf(':');
  return colon > slash
    ? { repository: reference.slice(0, colon), tag: reference.slice(colon + 1) }
    : { repository: reference, tag: 'latest' };
}

/** Talks to the Docker Engine API through its socket. */
export class DockerSocket implements Docker {
  constructor(private readonly socketPath = '/var/run/docker.sock') {}

  async container(name: string): Promise<ContainerInfo | undefined> {
    return this.json<ContainerInfo>('GET', `/containers/${encodeURIComponent(name)}/json`, {
      missingOk: true,
    });
  }

  async image(reference: string): Promise<ImageInfo | undefined> {
    const path = `/images/${encodeURIComponent(reference)}/json?manifests=1`;
    return this.json<ImageInfo>('GET', path, {
      missingOk: true,
    });
  }

  async pull(reference: string): Promise<void> {
    const { repository, tag } = splitReference(reference);
    const query = new URLSearchParams({ fromImage: repository, tag });
    // Docker answers with one line of progress per layer; a failed pull ends with an error line.
    const body = await this.call('POST', `/images/create?${query}`);
    for (const line of body.split('\n')) {
      if (!line.trim()) continue;
      const progress = JSON.parse(line) as { error?: string };
      if (progress.error) throw new DockerError(500, progress.error);
    }
  }

  async tag(id: string, reference: string): Promise<void> {
    const { repository, tag } = splitReference(reference);
    await this.call('POST', `/images/${id}/tag?${new URLSearchParams({ repo: repository, tag })}`);
  }

  async stop(id: string): Promise<void> {
    await this.call('POST', `/containers/${id}/stop?t=30`, { okStatus: [304] });
  }

  async start(id: string): Promise<void> {
    await this.call('POST', `/containers/${id}/start`, { okStatus: [304] });
  }

  async rename(id: string, name: string): Promise<void> {
    await this.call('POST', `/containers/${id}/rename?name=${encodeURIComponent(name)}`);
  }

  async remove(id: string): Promise<void> {
    await this.call('DELETE', `/containers/${id}?force=true`);
  }

  async create(name: string, body: Record<string, unknown>): Promise<string> {
    const created = await this.json<{ Id: string }>(
      'POST',
      `/containers/create?name=${encodeURIComponent(name)}`,
      { body },
    );
    if (!created) throw new DockerError(404, 'The image to create the container from is missing');
    return created.Id;
  }

  async connect(network: string, container: string, endpoint: EndpointSettings): Promise<void> {
    await this.call('POST', `/networks/${encodeURIComponent(network)}/connect`, {
      body: { Container: container, EndpointConfig: endpoint },
    });
  }

  async removeImage(id: string): Promise<void> {
    await this.call('DELETE', `/images/${id}`);
  }

  private async json<T>(
    method: string,
    path: string,
    options: { body?: unknown; missingOk?: boolean } = {},
  ): Promise<T | undefined> {
    try {
      return JSON.parse(await this.call(method, path, options)) as T;
    } catch (error) {
      if (options.missingOk && error instanceof DockerError && error.status === 404) {
        return undefined;
      }
      throw error;
    }
  }

  private call(
    method: string,
    path: string,
    options: { body?: unknown; okStatus?: number[] } = {},
  ): Promise<string> {
    const payload = options.body === undefined ? undefined : JSON.stringify(options.body);
    return new Promise((resolve, reject) => {
      const req = request(
        {
          socketPath: this.socketPath,
          path,
          method,
          headers: payload
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
            : {},
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('error', reject);
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            const status = res.statusCode ?? 500;
            if (status < 300 || options.okStatus?.includes(status)) return resolve(text);
            let message = text;
            try {
              message = (JSON.parse(text) as { message?: string }).message ?? text;
            } catch {
              // Not every error comes as JSON.
            }
            reject(new DockerError(status, message.trim() || `Docker answered ${status}`));
          });
        },
      );
      req.on('error', reject);
      req.end(payload);
    });
  }
}
