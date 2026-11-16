import { afterEach, expect, it, vi } from 'vitest'
import { Route } from './health'

const mocks = vi.hoisted(() => ({ database: Promise.resolve({}) as Promise<unknown> }))
vi.mock('../../server/app', () => ({ app: () => ({ database: mocks.database }) }))

afterEach(() => vi.restoreAllMocks())

const check = () => (Route.options.server!.handlers as { GET: () => Promise<Response> }).GET()

it('stays healthy while the database is unreachable after a successful start', async () => {
  const failing = vi.fn().mockRejectedValue(new Error('connection refused'))
  mocks.database = Promise.resolve({ execute: failing })
  expect((await check()).status).toBe(200)
})

it('fails when the database did not connect and migrate at startup', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  mocks.database = Promise.reject(new Error('migration failed'))
  mocks.database.catch(() => undefined)
  expect((await check()).status).toBe(503)
})
