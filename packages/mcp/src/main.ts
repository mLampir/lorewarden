import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { AppBridge, DEFAULT_PORT } from './bridge';
import { createServer } from './server';
import { AdventureStore } from './store';

const { values } = parseArgs({
  options: {
    dir: { type: 'string' },
    port: { type: 'string' },
    origin: { type: 'string', multiple: true },
  },
});
const dir = resolve(values.dir ?? process.env.LOREWARDEN_DIR ?? `${homedir()}/Lorewarden`);
const port = Number(values.port ?? process.env.LOREWARDEN_PORT ?? DEFAULT_PORT);

const bridge = new AppBridge(new AdventureStore(dir), values.origin ?? []);
const server = createServer(bridge, {
  tableState: () => bridge.tableState(),
  appSettings: () => bridge.appSettings(),
});
await server.connect(new StdioServerTransport());
// The open port would keep the process alive after the AI app quits; stop with it.
process.stdin.on('close', () => process.exit(0));
// Logs go to stderr; stdout belongs to the protocol.
console.error(`Lorewarden MCP server is running on ${dir}`);
try {
  await bridge.listen(port);
  console.error(`Waiting for the Lorewarden app on port ${port}`);
} catch (error) {
  // Another copy of the server may hold the port; the folder still works.
  console.error(`Cannot connect to the app on port ${port}: ${(error as Error).message}`);
}
