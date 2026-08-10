import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: { ...devices['Desktop Chrome'], baseURL: process.env.EXAMPLE_BASE_URL ?? 'http://127.0.0.1:3110', trace: 'retain-on-failure' },
})
