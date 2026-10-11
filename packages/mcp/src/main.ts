import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
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
    token: { type: 'string' },
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

// The server keeps a token for programs on the same computer in its folder. A server elsewhere
// needs it passed in: it is in the file .lorewarden/token in that server's adventure folder.
const token = values.token ?? process.env.LOREWARDEN_TOKEN ?? readToken();

const adventures = new ServerAdventures(url, folder, token);
const server = createServer(adventures, {
  tableState: () => adventures.tableState(),
  appSettings: () => adventures.appSettings(),
});
await server.connect(new StdioServerTransport());
// Logs go to stderr; stdout belongs to the protocol.
console.error(
  `Lorewarden MCP server is running with the Lorewarden server at ${url}${folder ? ` or the folder ${dir}` : ''}`,
);

function readToken(): string | undefined {
  if (!folder) return undefined;
  try {
    return readFileSync(join(dir, '.lorewarden', 'token'), 'utf8').trim() || undefined;
  } catch {
    return undefined;
  }
}
