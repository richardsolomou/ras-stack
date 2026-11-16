import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { app, closeApp } from './app'
import { mutationRpc } from './rpc'

const origin = 'http://localhost:3000'
let directory: string

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'app-'))
  vi.stubEnv('DATA_DIR', directory)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await closeApp()
  await rm(path.join(directory, 'app.sqlite'), { force: true })
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await rm(directory, { recursive: true, force: true })
})

async function signedUp() {
  const response = await app().auth.handler(
    new Request(`${origin}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({ name: 'Ada', email: 'ada@example.test', password: 'correct horse battery staple' }),
    }),
  )
  const { user } = (await response.clone().json()) as { user: { id: string } }
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ')
  return { id: user.id, cookie }
}

async function contextFor(cookie: string, claimed: string) {
  const withContext = vi.spyOn(app().telemetry.posthog, 'withContext')
  const request = new Request(`${origin}/_serverFn/example`, {
    method: 'POST',
    headers: { origin, 'sec-fetch-site': 'same-origin', cookie, 'x-posthog-distinct-id': claimed },
  })
  await mutationRpc(() => 'done', request)
  return withContext.mock.lastCall?.[0]
}

it('links server function telemetry to the signed-in person the browser names', async () => {
  const { id, cookie } = await signedUp()
  expect(await contextFor(cookie, id)).toMatchObject({ distinctId: id })
})

it('drops a person the browser names who is not the signed-in user', async () => {
  const { cookie } = await signedUp()
  expect(await contextFor(cookie, 'someone-else')).not.toHaveProperty('distinctId')
})

it('drops a person named by a signed-out caller', async () => {
  const { id } = await signedUp()
  expect(await contextFor('', id)).not.toHaveProperty('distinctId')
})
