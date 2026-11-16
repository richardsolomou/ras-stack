import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { EmailMessage } from '../adapters/email'
import * as authSchema from '../db/authSchema'
import { openDatabase } from '../db/database'
import { app, closeApp } from './app'
import { createAuth } from './auth'
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

function emailedAuth() {
  const sent: EmailMessage[] = []
  // The real migrations on a private in-memory database, so the flow proves the auth tables match Better Auth's schema.
  const database = openDatabase(':memory:')
  const auth = createAuth(drizzleAdapter(database, { provider: 'sqlite', schema: authSchema }), {
    send: (message) => {
      sent.push(message)
      return Promise.resolve()
    },
  })
  return { auth, sent }
}

function post(handler: (request: Request) => Promise<Response>, route: string, body: object, cookie = '') {
  return handler(
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

describe('auth flow on Drizzle', () => {
  it('signs up, signs in, reads the session, and signs out', async () => {
    const { auth } = emailedAuth()
    await post(auth.handler, '/sign-up/email', { name: 'Ada', email: 'ada@example.test', password })
    const cookie = cookieOf(await post(auth.handler, '/sign-in/email', { email: 'ada@example.test', password }))
    expect((await auth.api.getSession({ headers: new Headers({ cookie }) }))?.user.name).toBe('Ada')
    await post(auth.handler, '/sign-out', {}, cookie)
    expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).toBeNull()
  })

  it('verifies the email address from the emailed link', async () => {
    const { auth, sent } = emailedAuth()
    await post(auth.handler, '/sign-up/email', { name: 'Ada', email: 'ada@example.test', password })
    const verification = sent.find((message) => message.template === 'verifyEmail')
    const response = await auth.handler(new Request(verification!.data.url!))
    const session = await auth.api.getSession({ headers: new Headers({ cookie: cookieOf(response) }) })
    expect(session?.user.emailVerified).toBe(true)
  })

  it('resets the password from the emailed link and signs out every session', async () => {
    const { auth, sent } = emailedAuth()
    const cookie = cookieOf(await post(auth.handler, '/sign-up/email', { name: 'Ada', email: 'ada@example.test', password }))
    await post(auth.handler, '/request-password-reset', { email: 'ada@example.test', redirectTo: '/reset-password' })
    const reset = sent.find((message) => message.template === 'resetPassword')
    const token = new URL(reset!.data.url!).pathname.split('/').at(-1)
    const results = {
      reset: (await post(auth.handler, '/reset-password', { newPassword: 'a brand new passphrase', token })).status,
      oldSession: await auth.api.getSession({ headers: new Headers({ cookie }) }),
      replay: (await post(auth.handler, '/reset-password', { newPassword: 'replayed passphrase', token })).status,
      oldPassword: (await post(auth.handler, '/sign-in/email', { email: 'ada@example.test', password })).status,
      newPassword: (await post(auth.handler, '/sign-in/email', { email: 'ada@example.test', password: 'a brand new passphrase' })).status,
    }
    expect(results).toEqual({ reset: 200, oldSession: null, replay: 400, oldPassword: 401, newPassword: 200 })
  })

  it('sends the reset email to the account it belongs to', async () => {
    const { auth, sent } = emailedAuth()
    await post(auth.handler, '/sign-up/email', { name: 'Ada', email: 'ada@example.test', password })
    await post(auth.handler, '/request-password-reset', { email: 'ada@example.test', redirectTo: '/reset-password' })
    const user = (await auth.api.signInEmail({ body: { email: 'ada@example.test', password } })).user
    expect(sent.find((message) => message.template === 'resetPassword')).toMatchObject({ to: 'ada@example.test', distinctId: user.id })
  })
})

describe('session helpers', () => {
  async function signedUp() {
    return cookieOf(await post(app().auth.handler, '/sign-up/email', { name: 'Ada', email: 'ada@example.test', password }))
  }

  it('reads the signed-in user', async () => {
    const cookie = await signedUp()
    expect((await currentUser(withCookie(cookie)))?.email).toBe('ada@example.test')
  })

  it('reads no user without a session', async () => {
    expect(await currentUser(withCookie(''))).toBeNull()
  })

  it('looks the session up once per request', async () => {
    const request = withCookie(await signedUp())
    const getSession = vi.spyOn(app().auth.api, 'getSession')
    await currentSession(request)
    await currentUser(request)
    expect(getSession).toHaveBeenCalledOnce()
  })

  it('asks again after a failed lookup', async () => {
    const request = withCookie(await signedUp())
    vi.spyOn(app().auth.api, 'getSession').mockRejectedValueOnce(new Error('database unavailable'))
    await expect(currentSession(request)).rejects.toThrow('database unavailable')
    expect((await currentUser(request))?.name).toBe('Ada')
  })

  it('turns a signed-out caller into a sign-in message through rpc', async () => {
    await expect(rpc(() => requireUser(withCookie('')))).rejects.toThrow('Sign in to continue.')
  })
})
