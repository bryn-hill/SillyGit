import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // e2e/ holds the Playwright suite (npm run test:e2e)
    exclude: [...configDefaults.exclude, 'e2e/**']
  }
})
