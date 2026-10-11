import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { DEFAULT_SERVER_PORT } from '@lorewarden/core';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ServerAdventures } from './api';
import { createServer } from './server';
import { AdventureStore } from './store';

const { values } = parseArgs({
  options: {
    server: { type: 'string' },
    dir: { type: 'string' },
  },
});
const port = Number(process.env.LOREWARDEN_PORT ?? DEFAULT_SERVER_PORT);
const url = (values.server ?? process.env.LOREWARDEN_SERVER ?? `http://127.0.0.1:${port}`).replace(
  /\/+$/,
  '',
);
// Lorewarden on this computer keeps its adventures in a folder, which still works while it is
// not running. A Lorewarden server elsewhere has no folder here.
const remote = values.server !== undefined || process.env.LOREWARDEN_SERVER !== undefined;
const dir = resolve(values.dir ?? process.env.LOREWARDEN_DIR ?? `${homedir()}/Lorewarden`);
const folder = remote && values.dir === undefined ? undefined : new AdventureStore(dir);

const adventures = new ServerAdventures(url, folder);
const server = createServer(adventures, {
  tableState: () => adventures.tableState(),
  appSettings: () => adventures.appSettings(),
});
await server.connect(new StdioServerTransport());
// Logs go to stderr; stdout belongs to the protocol.
console.error(
  `Lorewarden MCP server is running with the Lorewarden server at ${url}${folder ? ` or the folder ${dir}` : ''}`,
);
