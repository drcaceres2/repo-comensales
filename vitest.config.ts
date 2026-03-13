import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    hookTimeout: 30000,
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      shared: path.resolve(__dirname, 'shared'),
      src: path.resolve(__dirname, 'src'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
