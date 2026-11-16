import { spacetimedbModuleTestPlugin } from 'spacetimedb/server/test-utils/vitest'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [spacetimedbModuleTestPlugin()],
  test: { include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts', 'spacetimedb/src/**/*.test.ts'] },
})
