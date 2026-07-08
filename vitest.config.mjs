import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: [
      'tests/**/*.test.{js,mjs,ts}',
      '!**/node_modules/**',
      '!**/pkg/**',
    ],
    exclude: [
      'e2e/**',
      '**/node_modules/**',
      '**/pkg/**',
      '**/target/**',
      'kamakazii_studio3D/tests/**',
    ],
    globals: true,
    testTimeout: 10_000,
  },
});
