import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { DEFAULT_TABLE_PORT, TableServer } from './table-server';

const { values } = parseArgs({
  options: {
    port: { type: 'string', default: String(DEFAULT_TABLE_PORT) },
    host: { type: 'string', default: '0.0.0.0' },
    'player-dir': { type: 'string' },
    origin: { type: 'string', multiple: true, default: [] },
    help: { type: 'boolean', default: false },
  },
});

if (values.help) {
  console.log(`Usage: lorewarden-table [options]

Shows handouts, images and hints from the Lorewarden game master app on the players' phones.

Options:
  --port <port>        Port to listen on (default ${DEFAULT_TABLE_PORT})
  --host <address>     Address to listen on (default 0.0.0.0, every network)
  --player-dir <dir>   Folder with the built player app (default: apps/player/dist)
  --origin <origin>    Also accept the game master app from this origin, e.g. a hosted copy
`);
  process.exit(0);
}

// The bundle lives in packages/server/dist, the player app is built to apps/player/dist.
const defaultPlayerDir = fileURLToPath(new URL('../../../apps/player/dist', import.meta.url));
const playerDir = values['player-dir'] ?? defaultPlayerDir;
if (!existsSync(playerDir)) {
  console.warn(`No player app in ${playerDir}. Build it with "pnpm table" or pass --player-dir.`);
}

const server = new TableServer({ playerDir, allowedOrigins: values.origin });
try {
  const port = await server.listen(Number(values.port), values.host);
  const urls = server.joinUrls();
  console.log(`Lorewarden table server is running on port ${port}.`);
  console.log(
    urls.length > 0
      ? `Phones in the same network reach it at ${urls.join(' or ')}`
      : 'No local network found. Phones need to be in the same Wi-Fi as this computer.',
  );
  console.log('Open live mode in the game master app and show the QR code to the players.');
  console.log('Press Ctrl+C to stop.');
} catch (error) {
  const code = (error as NodeJS.ErrnoException).code;
  console.error(
    code === 'EADDRINUSE'
      ? `Port ${values.port} is in use. Is the table server already running? Otherwise pass --port.`
      : String(error),
  );
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
