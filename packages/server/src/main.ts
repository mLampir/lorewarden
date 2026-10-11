import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { DEFAULT_SERVER_PORT, LorewardenServer } from './server';
import { Store } from './store';

const { values } = parseArgs({
  options: {
    dir: { type: 'string' },
    port: { type: 'string' },
    host: { type: 'string', default: '0.0.0.0' },
    origin: { type: 'string', multiple: true, default: [] },
    help: { type: 'boolean', default: false },
  },
});

if (values.help) {
  console.log(`Usage: lorewarden-server [options]

Keeps your Lorewarden adventures, serves the game master app on this computer and shows
handouts, images and hints on the players' phones in the local network.

Options:
  --dir <folder>       Where adventures are kept (default ~/Lorewarden, or LOREWARDEN_DIR)
  --port <port>        Port to listen on (default ${DEFAULT_SERVER_PORT}, or LOREWARDEN_PORT)
  --host <address>     Address to listen on (default 0.0.0.0, every network)
  --origin <origin>    Also accept the game master app from this origin, e.g. a hosted copy
`);
  process.exit(0);
}

const dir = resolve(values.dir ?? process.env.LOREWARDEN_DIR ?? `${homedir()}/Lorewarden`);
const port = Number(values.port ?? process.env.LOREWARDEN_PORT ?? DEFAULT_SERVER_PORT);

// The bundle lives in packages/server/dist, the apps are built to apps/*/dist.
const appDir = (name: string) =>
  fileURLToPath(new URL(`../../../apps/${name}/dist`, import.meta.url));
const gmDir = appDir('dm');
const playerDir = appDir('player');
for (const folder of [gmDir, playerDir]) {
  if (!existsSync(folder)) console.warn(`No built app in ${folder}; "pnpm start" builds it.`);
}

const server = new LorewardenServer({
  store: new Store(dir),
  gmDir,
  playerDir,
  allowedOrigins: values.origin,
});
try {
  const listening = await server.listen(port, values.host);
  const urls = server.joinUrls();
  console.log(`Lorewarden is running. Open http://localhost:${listening} in your browser.`);
  console.log(`Adventures are kept in ${dir}`);
  console.log(
    urls.length > 0
      ? `Players' phones in the same Wi-Fi join at ${urls.join(' or ')}`
      : 'No local network found. Players need to be in the same Wi-Fi as this computer.',
  );
  console.log('Press Ctrl+C to stop.');
} catch (error) {
  const code = (error as NodeJS.ErrnoException).code;
  console.error(
    code === 'EADDRINUSE'
      ? `Port ${port} is in use. Is Lorewarden already running? Otherwise pass --port.`
      : String(error),
  );
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
