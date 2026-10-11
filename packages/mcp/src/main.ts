import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server';
import { AdventureStore } from './store';

const { values } = parseArgs({ options: { dir: { type: 'string' } } });
const dir = resolve(values.dir ?? process.env.LOREWARDEN_DIR ?? `${homedir()}/Lorewarden`);

const server = createServer(new AdventureStore(dir));
await server.connect(new StdioServerTransport());
// Logs go to stderr; stdout belongs to the protocol.
console.error(`Lorewarden MCP server is running on ${dir}`);
