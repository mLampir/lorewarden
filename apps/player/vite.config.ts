import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vue()],
  // The Lorewarden server serves the player app at /play/.
  base: '/play/',
  server: {
    port: 5174,
    // Phones in the local network can open the dev server too.
    host: true,
    proxy: { '/api': 'http://localhost:47616' },
  },
});
