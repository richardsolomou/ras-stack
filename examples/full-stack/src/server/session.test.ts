import { mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { clearGlobalSingleton } from 'ras-stack/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { currentUser, sessionCookie } from './session'

let directory: string

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'ras-stack-example-'))
  process.env.DATA_DIR = directory
})

afterEach(async () => {
  await clearGlobalSingleton<{ database: { $client: { close(): void } } }>('ras-stack.example.full-stack', ({ database }) =>
    database.$client.close(),
  )
  await rm(directory, { recursive: true, force: true })
  delete process.env.DATA_DIR
})

describe('example session', () => {
  it('round-trips a signed session cookie', () => {
    const session = sessionCookie('Ada')
    const request = new Request('http://localhost', { headers: { cookie: `${session.name}=${session.value}` } })
    expect(currentUser(request)?.name).toBe('Ada')
  })

  it('rejects a modified session cookie', () => {
    const session = sessionCookie('Ada')
    const request = new Request('http://localhost', { headers: { cookie: `${session.name}=${session.value}x` } })
    expect(currentUser(request)).toBeUndefined()
  })

  it('rejects a session older than one hour', () => {
    const session = sessionCookie('Ada', 0)
    const request = new Request('http://localhost', { headers: { cookie: `${session.name}=${session.value}` } })
    expect(currentUser(request, 60 * 60 * 1000 + 1)).toBeUndefined()
  })
})
