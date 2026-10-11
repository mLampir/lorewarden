import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5174,
    // Phones in the local network can open the dev server too.
    host: true,
    // The table server (pnpm table) answers the API calls.
    proxy: { '/api': 'http://localhost:47616' },
  },
});
