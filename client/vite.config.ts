import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: process.env.PAGES === '1' ? '/cabinet-planner/' : '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@planner/shared': path.resolve(root, '../shared/src/index.ts'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': 'http://127.0.0.1:3001',
    },
  },
});
