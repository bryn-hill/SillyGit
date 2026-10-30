import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // The git tests spawn many git processes, which takes longer than 5s on a busy Mac runner.
    testTimeout: 30_000,
    // e2e/ holds the Playwright suite (npm run test:e2e)
    exclude: [...configDefaults.exclude, 'e2e/**']
  }
})
