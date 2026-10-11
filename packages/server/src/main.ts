import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { DEFAULT_SERVER_PORT, LorewardenServer } from './server';
import { Store } from './store';
import { watchForUpdates } from './updates';

/** Set by build.mjs: the release version, or "dev" for a build from source. */
declare const __LOREWARDEN_VERSION__: string;

const { values } = parseArgs({
  options: {
    dir: { type: 'string' },
    port: { type: 'string' },
    host: { type: 'string' },
    origin: { type: 'string', multiple: true, default: [] },
    'no-update-check': { type: 'boolean', default: false },
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
  --host <address>     Address to listen on (default 0.0.0.0, every network, or LOREWARDEN_HOST)
  --origin <origin>    Also accept the game master app from this origin, e.g. a hosted copy
  --no-update-check    Do not ask GitHub for new releases (or LOREWARDEN_UPDATE_CHECK=off)
`);
  process.exit(0);
}

const dir = resolve(values.dir ?? process.env.LOREWARDEN_DIR ?? `${homedir()}/Lorewarden`);
const port = Number(values.port ?? process.env.LOREWARDEN_PORT ?? DEFAULT_SERVER_PORT);
const host = values.host ?? process.env.LOREWARDEN_HOST ?? '0.0.0.0';
// Builds from source have no release to compare with.
const checkForUpdates =
  __LOREWARDEN_VERSION__ !== 'dev' &&
  !values['no-update-check'] &&
  process.env.LOREWARDEN_UPDATE_CHECK !== 'off';

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
  version: __LOREWARDEN_VERSION__,
});
try {
  const listening = await server.listen(port, host);
  const urls = server.joinUrls();
  console.log(`Lorewarden is running. Open http://localhost:${listening} in your browser.`);
  console.log(`Adventures are kept in ${dir}`);
  console.log(
    urls.length > 0
      ? `Players' phones in the same Wi-Fi join at ${urls.join(' or ')}`
      : 'No local network found. Players need to be in the same Wi-Fi as this computer.',
  );
  console.log(`Version ${__LOREWARDEN_VERSION__}. Press Ctrl+C to stop.`);
  if (checkForUpdates) watchForUpdates(__LOREWARDEN_VERSION__, (info) => server.setUpdate(info));
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
