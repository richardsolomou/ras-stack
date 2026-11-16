import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { app, closeApp } from './app'

beforeAll(() => {
  // Without a server the startup migration fails in the background, which these tests do not depend on.
  vi.stubEnv('DATABASE_URL', process.env.DATABASE_URL ?? 'postgres://app@127.0.0.1:9/app')
})

afterEach(() => closeApp())

afterAll(() => {
  vi.unstubAllEnvs()
})

it('creates one instance and shares it', () => {
  expect(app()).toBe(app())
})

it('creates a fresh instance after closing', async () => {
  const first = app()
  await closeApp()
  expect(app()).not.toBe(first)
})
