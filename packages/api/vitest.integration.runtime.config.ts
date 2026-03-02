import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/services/sessions/codex-runner.integration.test.ts'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 120000,
    hookTimeout: 30000,
    setupFiles: ['./src/test/setup.ts', './src/test/integration-runtime-setup.ts'],
  },
});
