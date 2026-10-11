import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    // The Lorewarden server (pnpm dev starts it too) keeps the adventures.
    proxy: { '/api': 'http://localhost:47616' },
  },
});
