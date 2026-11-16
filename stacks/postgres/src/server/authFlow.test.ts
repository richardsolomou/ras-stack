import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import type { EmailMessage } from '../adapters/email'
import * as authSchema from '../db/authSchema'
import { connect } from '../db/database'
import { app, closeApp } from './app'
import { createAuth } from './auth'
import { rpc } from './rpc'
import { currentSession, currentUser, requireUser } from './session'

// Skipped without a server, like the database recipe's integration suite; CI supplies DATABASE_URL.
const url = process.env.DATABASE_URL
const origin = 'http://localhost:3000'
const password = 'correct horse battery staple'

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
const linkIn = (message: EmailMessage | undefined) => /using this link: (\S+)/.exec(message?.text ?? '')?.[1]

describe.skipIf(!url)('auth flow on PostgreSQL', () => {
  // Every test signs up its own address, so the shared database needs no cleanup between them.
  const email = () => `${randomUUID()}@example.test`

  afterEach(async () => {
    vi.restoreAllMocks()
    await closeApp()
  })

  const emailed = async () => {
    await app().database
    const database = connect(url!)
    const sent: EmailMessage[] = []
    const auth = createAuth(drizzleAdapter(database, { provider: 'pg', schema: authSchema }), {
      send: (message) => {
        sent.push(message)
        return Promise.resolve()
      },
      verify: () => Promise.resolve(),
    })
    return { auth, sent, close: () => database.$client.end({ timeout: 5 }) }
  }

  const opened: (() => Promise<void>)[] = []
  afterAll(async () => {
    await Promise.all(opened.map((close) => close()))
  })

  it('signs up, signs in, reads the session, and signs out', async () => {
    const { auth, close } = await emailed()
    opened.push(close)
    const address = email()
    await post(auth.handler, '/sign-up/email', { name: 'Ada', email: address, password })
    const cookie = cookieOf(await post(auth.handler, '/sign-in/email', { email: address, password }))
    expect((await auth.api.getSession({ headers: new Headers({ cookie }) }))?.user.name).toBe('Ada')
    await post(auth.handler, '/sign-out', {}, cookie)
    expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).toBeNull()
  })

  it('resets the password from the emailed link and signs out every session', async () => {
    const { auth, sent, close } = await emailed()
    opened.push(close)
    const address = email()
    const cookie = cookieOf(await post(auth.handler, '/sign-up/email', { name: 'Ada', email: address, password }))
    await post(auth.handler, '/request-password-reset', { email: address, redirectTo: '/reset-password' })
    const token = new URL(linkIn(sent.find((message) => message.subject.startsWith('Reset')))!).pathname.split('/').at(-1)
    const results = {
      reset: (await post(auth.handler, '/reset-password', { newPassword: 'a brand new passphrase', token })).status,
      oldSession: await auth.api.getSession({ headers: new Headers({ cookie }) }),
      newPassword: (await post(auth.handler, '/sign-in/email', { email: address, password: 'a brand new passphrase' })).status,
    }
    expect(results).toEqual({ reset: 200, oldSession: null, newPassword: 200 })
  })

  it('reads the signed-in user through the awaited auth instance', async () => {
    const address = email()
    const cookie = cookieOf(
      await post(async (request) => (await app().auth).handler(request), '/sign-up/email', { name: 'Ada', email: address, password }),
    )
    expect((await currentUser(withCookie(cookie)))?.email).toBe(address)
  })

  it('looks the session up once per request', async () => {
    const address = email()
    const request = withCookie(
      cookieOf(
        await post(async (incoming) => (await app().auth).handler(incoming), '/sign-up/email', { name: 'Ada', email: address, password }),
      ),
    )
    const getSession = vi.spyOn((await app().auth).api, 'getSession')
    await currentSession(request)
    await currentUser(request)
    expect(getSession).toHaveBeenCalledOnce()
  })

  it('turns a signed-out caller into a sign-in message through rpc', async () => {
    await expect(rpc(() => requireUser(withCookie('')))).rejects.toThrow('Sign in to continue.')
  })
})
