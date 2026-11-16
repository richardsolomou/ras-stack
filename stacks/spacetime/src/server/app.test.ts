import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { app, closeApp } from './app'

let directory: string

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'app-'))
  vi.stubEnv('DATA_DIR', directory)
})

afterEach(() => closeApp())

afterAll(async () => {
  vi.unstubAllEnvs()
  await rm(directory, { recursive: true, force: true })
})

it('creates one instance and shares it', () => {
  expect(app()).toBe(app())
})

it('creates a fresh instance after closing', async () => {
  const first = app()
  await closeApp()
  expect(app()).not.toBe(first)
})
