import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { app, closeApp } from './app'
import { rpc } from './rpc'
import { currentSession, currentUser, requireUser } from './session'

const origin = 'http://localhost:3000'
const password = 'correct horse battery staple'
let directory: string

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'app-'))
  vi.stubEnv('DATA_DIR', directory)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await closeApp()
  // Each test signs up the same address, so each starts from an empty database.
  await rm(path.join(directory, 'app.sqlite'), { force: true })
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await rm(directory, { recursive: true, force: true })
})

async function post(route: string, body: object, cookie = '') {
  return (await app().auth).handler(
    new Request(`${origin}/api/auth${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin, cookie },
      body: JSON.stringify(body),
    }),
  )
}

function cookieOf(response: Response) {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ')
}

const withCookie = (cookie: string) => new Request(origin, { headers: { cookie } })
const signedUp = async () => cookieOf(await post('/sign-up/email', { name: 'Ada', email: 'ada@example.test', password }))

describe('auth on libsql', () => {
  it('signs up, signs in, reads the session, and signs out', async () => {
    await signedUp()
    const cookie = cookieOf(await post('/sign-in/email', { email: 'ada@example.test', password }))
    expect((await currentUser(withCookie(cookie)))?.name).toBe('Ada')
    await post('/sign-out', {}, cookie)
    expect(await currentUser(withCookie(cookie))).toBeNull()
  })

  it('looks the session up once per request', async () => {
    const request = withCookie(await signedUp())
    const getSession = vi.spyOn((await app().auth).api, 'getSession')
    await currentSession(request)
    await currentUser(request)
    expect(getSession).toHaveBeenCalledOnce()
  })

  it('asks again after a failed lookup', async () => {
    const request = withCookie(await signedUp())
    vi.spyOn((await app().auth).api, 'getSession').mockRejectedValueOnce(new Error('database unavailable'))
    await expect(currentSession(request)).rejects.toThrow('database unavailable')
    expect((await currentUser(request))?.name).toBe('Ada')
  })

  it('turns a signed-out caller into a sign-in message through rpc', async () => {
    await expect(rpc(() => requireUser(withCookie('')))).rejects.toThrow('Sign in to continue.')
  })
})
