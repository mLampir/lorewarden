import type { IncomingMessage, ServerResponse } from 'node:http';
import { ServerAdventures } from '@lorewarden/mcp/src/api';
import { createServer } from '@lorewarden/mcp/src/server';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

/**
 * Offers the Lorewarden MCP tools at /mcp, so an AI assistant such as Claude connects by URL.
 * The tools work through this server's own API, like the MCP server on the game master's
 * computer, so the open app shows every change right away.
 */
export function mcpEndpoint(
  apiUrl: string,
  token: string,
  version: string,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    const adventures = new ServerAdventures(apiUrl, undefined, token);
    const server = createServer(adventures, {
      version,
      tableState: () => adventures.tableState(),
      appSettings: () => adventures.appSettings(),
    });
    // Without sessions: every request stands alone, which fits a server behind a proxy.
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res);
  };
}
