// Bundles the server with all its dependencies into one file that Node.js runs directly,
// so the AI app only needs a path to it.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/lorewarden-mcp.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  banner: {
    js: [
      '#!/usr/bin/env node',
      // Some dependencies are CommonJS and call require().
      "import { createRequire } from 'node:module';",
      'const require = createRequire(import.meta.url);',
    ].join('\n'),
  },
  logLevel: 'info',
});
