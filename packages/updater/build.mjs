// Bundles the updater into one file that Node.js runs directly.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/lorewarden-updater.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  logLevel: 'info',
});
