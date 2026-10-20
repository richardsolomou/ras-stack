import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      exclude: ['src/**/*.test.ts', 'src/**/testing.ts'],
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text-summary'],
      thresholds: { branches: 84, functions: 93, lines: 93, statements: 90 },
    },
    include: ['../../actions/**/*.test.ts', 'src/**/*.test.ts'],
  },
})
