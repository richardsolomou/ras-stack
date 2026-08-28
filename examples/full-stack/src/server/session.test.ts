import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { clearGlobalSingleton } from 'ras-stack/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { app, closeApp } from './app'
import { currentUser } from './session'

let directory: string

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'ras-stack-example-auth-'))
  process.env.DATA_DIR = directory
  process.env.APP_URL = 'http://localhost:3100'
})

afterEach(async () => {
  await clearGlobalSingleton('ras-stack.example.full-stack', closeApp)
  await rm(directory, { recursive: true, force: true })
  delete process.env.DATA_DIR
  delete process.env.APP_URL
})

describe('Better Auth integration', () => {
  it('creates a database-backed user and session', async () => {
    const response = await authRequest('/sign-up/email', {
      name: 'Ada',
      email: 'ada@example.test',
      password: 'correct horse battery staple',
    })
    expect(response.status).toBe(200)
    const cookie = response.headers.get('set-cookie')
    expect(cookie).toContain('ras_stack_example.session_token=')
    const request = new Request('http://localhost:3100', { headers: { cookie: cookie! } })
    expect((await currentUser(request))?.email).toBe('ada@example.test')
  })

  it('rejects a cross-origin sign-up', async () => {
    const response = await authRequest(
      '/sign-up/email',
      { name: 'Mallory', email: 'mallory@example.test', password: 'correct horse battery staple' },
      'https://attacker.example',
    )
    expect(response.status).toBe(403)
  })
})

function authRequest(endpoint: string, body: object, origin = 'http://localhost:3100') {
  return app().auth.handler(
    new Request(`http://localhost:3100/api/auth${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify(body),
    }),
  )
}
