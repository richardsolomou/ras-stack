import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      exclude: ['src/**/*.test.ts'],
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text-summary'],
      thresholds: { branches: 79, functions: 91, lines: 90, statements: 88 },
    },
    include: ['actions/**/*.test.ts', 'src/**/*.test.ts'],
  },
})
