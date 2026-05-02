import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';

// Load .env file for tests
dotenv.config();

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['client/**', 'node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/migrations/**', 'src/seeds/**'],
    },
  },
});
