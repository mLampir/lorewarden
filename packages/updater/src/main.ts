import { createHash, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createServer, type IncomingMessage } from 'node:http';
import { DockerSocket } from './docker';
import { recover, type UpdateStatus, update } from './update';

/** The port inside the Docker network; it is never published. */
export const DEFAULT_UPDATER_PORT = 47617;
const MIN_TOKEN_LENGTH = 32;

const env = process.env;
const token = (
  env.LOREWARDEN_UPDATER_TOKEN_FILE
    ? readFileSync(env.LOREWARDEN_UPDATER_TOKEN_FILE, 'utf8')
    : (env.LOREWARDEN_UPDATER_TOKEN ?? '')
).trim();
if (token.length < MIN_TOKEN_LENGTH) {
  console.error(
    `Set LOREWARDEN_UPDATER_TOKEN to a secret of at least ${MIN_TOKEN_LENGTH} characters, ` +
      'the same for Lorewarden and the updater, e.g. from "openssl rand -hex 32".',
  );
  process.exit(1);
}
const tokenHash = createHash('sha256').update(token).digest();

const container = env.LOREWARDEN_CONTAINER || 'lorewarden';
const dataDir = env.LOREWARDEN_DATA_DIR || '/data';
const backupsDir = env.LOREWARDEN_BACKUP_DIR || '/backups';
const keepBackups = Math.max(1, Number(env.LOREWARDEN_KEEP_BACKUPS) || 3);
const port = Number(env.LOREWARDEN_UPDATER_PORT) || DEFAULT_UPDATER_PORT;
const docker = new DockerSocket(env.DOCKER_SOCKET || '/var/run/docker.sock');

for (const [name, folder] of [
  ['data', dataDir],
  ['backup', backupsDir],
] as const) {
  if (!existsSync(folder)) {
    console.error(`The ${name} folder ${folder} is missing. Mount it as a volume.`);
    process.exit(1);
  }
}

let status: UpdateStatus = { state: 'idle', at: new Date().toISOString() };

function authorized(req: IncomingMessage): boolean {
  const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1] ?? '';
  return timingSafeEqual(createHash('sha256').update(bearer).digest(), tokenHash);
}

async function runUpdate(): Promise<void> {
  console.log(`Updating the container "${container}".`);
  status = await update({
    docker,
    container,
    dataDir,
    backupsDir,
    keepBackups,
    onStep: (step, versions) => {
      status = { state: 'running', step, ...versions, at: status.at };
      console.log(`Update: ${step}`);
    },
  });
  console.log(
    `Update ${status.state}${status.from ? ` from ${status.from}` : ''}` +
      `${status.to ? ` to ${status.to}` : ''}${status.error ? `: ${status.error}` : ''}`,
  );
}

// Requests carry no settings: whoever has the token can only update Lorewarden to the newest
// image of the tag it already runs.
const server = createServer((req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');
  if (req.method === 'GET' && pathname === '/health') return void res.writeHead(204).end();
  if (!authorized(req)) return void res.writeHead(401).end('Wrong token');
  if (req.method === 'GET' && pathname === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return void res.end(JSON.stringify(status));
  }
  if (req.method === 'POST' && pathname === '/update') {
    if (status.state === 'running') return void res.writeHead(409).end('An update is running');
    status = { state: 'running', at: new Date().toISOString() };
    void runUpdate();
    return void res.writeHead(202).end();
  }
  res.writeHead(404).end('Not found');
});

try {
  if (await recover(docker, container)) {
    console.log(`Brought back "${container}" after an update that did not finish.`);
  }
} catch (error) {
  console.warn(`Cannot reach Docker: ${error instanceof Error ? error.message : error}`);
}

server.listen(port, () => {
  console.log(`Lorewarden updater listens on port ${port} and updates "${container}".`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
