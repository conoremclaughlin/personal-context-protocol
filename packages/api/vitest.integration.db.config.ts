import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    exclude: [
      'node_modules',
      'dist',
      // Runtime/CLI E2E tests run in vitest.integration.runtime.config.ts
      'src/services/sessions/codex-runner.integration.test.ts',
    ],
    testTimeout: 120000,
    hookTimeout: 30000,
    setupFiles: ['./src/test/setup.ts', './src/test/integration-setup.ts'],
  },
});
