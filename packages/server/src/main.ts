import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { Auth, MIN_PASSWORD_LENGTH, setupMessage } from './auth';
import { mcpEndpoint } from './mcp';
import { OAuth } from './oauth';
import { DEFAULT_SERVER_PORT, LorewardenServer } from './server';
import { Store } from './store';
import { watchForUpdates } from './updates';

/** Set by build.mjs: the release version, or "dev" for a build from source. */
declare const __LOREWARDEN_VERSION__: string;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    dir: { type: 'string' },
    port: { type: 'string' },
    host: { type: 'string' },
    origin: { type: 'string', multiple: true, default: [] },
    'no-update-check': { type: 'boolean', default: false },
    'trust-proxy': { type: 'boolean', default: false },
    'public-url': { type: 'string' },
    help: { type: 'boolean', default: false },
  },
});

if (values.help) {
  console.log(`Usage: lorewarden-server [options]
       lorewarden-server reset-password [--dir <folder>]

Keeps your Lorewarden adventures, serves the game master app on this computer and shows
handouts, images and hints on the players' phones in the local network.

Without a password, the game master app works on this computer only. To use it from another
computer, choose a password with the setup link the server prints, in the app's settings, or
with LOREWARDEN_PASSWORD. "reset-password" removes a forgotten password and prints a new setup
link.

Options:
  --dir <folder>       Where adventures are kept (default ~/Lorewarden, or LOREWARDEN_DIR)
  --port <port>        Port to listen on (default ${DEFAULT_SERVER_PORT}, or LOREWARDEN_PORT)
  --host <address>     Address to listen on (default 0.0.0.0, every network, or LOREWARDEN_HOST)
  --origin <origin>    Also accept the game master app from this origin, e.g. a hosted copy
  --no-update-check    Do not ask GitHub for new releases (or LOREWARDEN_UPDATE_CHECK=off)
  --trust-proxy        Behind a reverse proxy: limit sign-in attempts per address the proxy
                       passes on in X-Real-IP or X-Forwarded-For (or LOREWARDEN_TRUST_PROXY=1).
                       No request counts as from this computer then, so the first password
                       needs the setup link.
  --public-url <url>   The address people use, e.g. https://lorewarden.example.org, for AI
                       assistants that connect to <url>/mcp (or LOREWARDEN_PUBLIC_URL). By
                       default it is taken from the requests.

Environment:
  LOREWARDEN_PASSWORD       The game master's password (at least ${MIN_PASSWORD_LENGTH} characters)
  LOREWARDEN_PASSWORD_FILE  A file with the password, e.g. a Docker secret
`);
  process.exit(0);
}

const dir = resolve(values.dir ?? process.env.LOREWARDEN_DIR ?? `${homedir()}/Lorewarden`);

if (positionals[0] === 'reset-password') {
  const auth = await Auth.open(dir);
  OAuth.reset(dir);
  console.log(setupMessage(auth.resetPassword()));
  if (environmentPassword()) {
    console.log('LOREWARDEN_PASSWORD is set, though, and takes the place of the stored password.');
  }
  process.exit(0);
} else if (positionals.length > 0) {
  console.error(`Unknown command "${positionals[0]}". See --help.`);
  process.exit(1);
}

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

const password = environmentPassword();
if (password !== undefined && password.length < MIN_PASSWORD_LENGTH) {
  console.warn(`LOREWARDEN_PASSWORD is shorter than ${MIN_PASSWORD_LENGTH} characters.`);
}
const auth = await Auth.open(dir, { password, log: (message) => console.log(message) });

// The MCP endpoint works through the server's own API, on this computer.
const apiHost =
  host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host.includes(':') ? `[${host}]` : host;

const server = new LorewardenServer({
  store: new Store(dir),
  auth,
  oauth: new OAuth(dir),
  mcp: mcpEndpoint(`http://${apiHost}:${port}`, auth.token, __LOREWARDEN_VERSION__),
  publicUrl: values['public-url'] ?? process.env.LOREWARDEN_PUBLIC_URL,
  trustProxy: values['trust-proxy'] || process.env.LOREWARDEN_TRUST_PROXY === '1',
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

function environmentPassword(): string | undefined {
  const file = process.env.LOREWARDEN_PASSWORD_FILE;
  const password = file
    ? readFileSync(file, 'utf8').replace(/\r?\n$/, '')
    : process.env.LOREWARDEN_PASSWORD;
  return password ? password : undefined;
}
