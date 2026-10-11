// Bundles the server with all its dependencies into one file that Node.js runs directly.
import { build } from 'esbuild';

// Release builds pass the version, e.g. LOREWARDEN_VERSION=1.2.0; a build from source is "dev".
const version = process.env.LOREWARDEN_VERSION || 'dev';

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/lorewarden-server.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  define: { __LOREWARDEN_VERSION__: JSON.stringify(version) },
  banner: {
    js: [
      '#!/usr/bin/env node',
      // Some dependencies of the MCP endpoint are CommonJS and call require().
      "import { createRequire } from 'node:module';",
      'const require = createRequire(import.meta.url);',
    ].join('\n'),
  },
  logLevel: 'info',
});
