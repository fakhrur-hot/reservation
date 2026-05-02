import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/tests/validation/**/*.test.ts'],
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
    reporters: ['verbose'],
  },
});
