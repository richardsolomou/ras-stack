import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      exclude: ['src/**/*.test.ts'],
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text-summary'],
      thresholds: { branches: 82, functions: 91, lines: 91, statements: 89 },
    },
    include: ['actions/**/*.test.ts', 'src/**/*.test.ts'],
  },
})
