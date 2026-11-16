import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      exclude: ['src/**/*.test.ts', 'src/**/testing.ts'],
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text-summary'],
      thresholds: { branches: 86, functions: 96, lines: 96, statements: 92 },
    },
    include: ['../../actions/**/*.test.ts', 'scripts/**/*.test.ts', 'src/**/*.test.ts'],
  },
})
