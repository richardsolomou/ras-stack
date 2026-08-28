import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { clearGlobalSingleton } from 'ras-stack/server'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { closeApp } from './app'
import { limitAuthenticatedRequest } from './rate-limit'

let directory: string

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'ras-stack-example-rate-limit-'))
  process.env.DATA_DIR = directory
  process.env.APP_URL = 'http://localhost:3100'
})

afterEach(async () => {
  await clearGlobalSingleton('ras-stack.example.full-stack', closeApp)
  await rm(directory, { recursive: true, force: true })
  delete process.env.DATA_DIR
  delete process.env.APP_URL
})

it('keeps authenticated user budgets separate', async () => {
  await limitAuthenticatedRequest(request(), 'messages', 'alice', { window: 60, max: 1 })
  await expect(limitAuthenticatedRequest(request(), 'messages', 'alice', { window: 60, max: 1 })).rejects.toMatchObject({ status: 429 })
  await expect(limitAuthenticatedRequest(request(), 'messages', 'bob', { window: 60, max: 1 })).resolves.toMatchObject({ remaining: 0 })
})

function request() {
  return new Request('http://localhost:3100/messages')
}
