import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // The git tests spawn many git processes, which takes longer than 5s on a busy Mac runner.
    testTimeout: 30_000,
    // e2e/ holds the Playwright suite (npm run test:e2e)
    exclude: [...configDefaults.exclude, 'e2e/**'],
    // The suite is mostly real git repositories, so workers spend much of their time waiting on git
    // processes: use every core instead of the default one less.
    maxWorkers: '100%',
    env: {
      // Real-repo tests ignore the developer's own and the system git config (see vitest.gitconfig).
      GIT_CONFIG_GLOBAL: fileURLToPath(new URL('./vitest.gitconfig', import.meta.url)),
      GIT_CONFIG_NOSYSTEM: '1'
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.support.ts', 'src/**/*.d.ts'],
      reporter: ['text-summary', 'text', 'html']
    }
  }
})
