import { describe, expect, it } from 'vitest'
import { requireSameOrigin } from '../auth/origins.js'
import { databaseTarget } from '../database/index.js'
import { openSqliteClient } from '../database/sqlite.js'
import { healthResponse } from '../server/health.js'
import { postHogBrowserOptions } from '../posthog/client.js'
import { postHogRequestContext } from '../posthog/request.js'
import { signRealtimeToken } from '../realtime/tokens.js'
import {
  assertDatabaseTargetConformance,
  assertHealthHandlerConformance,
  assertMutationOriginConformance,
  assertPostHogBrowserConformance,
  assertPostHogRequestConformance,
  assertRealtimeTokenConformance,
  assertSqliteConformance,
} from './index.js'

describe('consumer conformance assertions', () => {
  it('accepts the shared mutation-origin composition', async () => {
    await expect(assertMutationOriginConformance((request) => requireSameOrigin(request))).resolves.toBeUndefined()
  })

  it('identifies a permissive mutation-origin composition', async () => {
    await expect(assertMutationOriginConformance(() => undefined)).rejects.toThrow('cross-origin request: expected request to be rejected')
  })

  it('accepts the shared health composition', async () => {
    await expect(assertHealthHandlerConformance((check) => () => healthResponse(check))).resolves.toBeUndefined()
  })

  it('identifies a health handler that leaks private errors', async () => {
    await expect(
      assertHealthHandlerConformance((check) => async () => {
        try {
          await check()
          return Response.json({ ok: true })
        } catch (error) {
          return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 503 })
        }
      }),
    ).rejects.toThrow('unavailable dependency: response exposed the private diagnostic message')
  })

  it('accepts a standard native SQLite connection', async () => {
    const client = openSqliteClient(':memory:')
    await expect(assertSqliteConformance((name) => client.pragma(name, { simple: true }))).resolves.toBeUndefined()
    client.close()
  })

  it('identifies unsafe SQLite settings', async () => {
    await expect(
      assertSqliteConformance((name) => ({ journal_mode: 'delete', synchronous: 0, busy_timeout: 0, foreign_keys: 0 })[name]),
    ).rejects.toThrow('SQLite journal mode: expected wal or memory, received delete')
  })

  it('accepts the shared dual-provider database target', () => {
    expect(() => assertDatabaseTargetConformance(databaseTarget)).not.toThrow()
  })

  it('identifies a SQLite-only database target', () => {
    expect(() => assertDatabaseTargetConformance(({ sqliteFile }) => ({ provider: 'sqlite', file: sqliteFile }))).toThrow(
      'PostgreSQL database target: expected the configured postgres: URL',
    )
  })

  it('accepts the shared PostHog browser and request composition', () => {
    expect(() =>
      assertPostHogBrowserConformance(postHogBrowserOptions({ apiHost: '/ingest', uiHost: 'https://us.posthog.com' })),
    ).not.toThrow()
    expect(() => assertPostHogRequestConformance(postHogRequestContext)).not.toThrow()
  })

  it('identifies PostHog setup without error tracking or identity verification', () => {
    expect(() =>
      assertPostHogBrowserConformance({ api_host: '/ingest', ui_host: 'https://us.posthog.com', defaults: '2026-05-30' }),
    ).toThrow('PostHog browser initialization: exception autocapture must be enabled')
    expect(() =>
      assertPostHogRequestConformance((request) => {
        const sessionId = request.headers.get('x-posthog-session-id')!
        return {
          distinctId: request.headers.get('x-posthog-distinct-id')!,
          sessionId,
          properties: { $session_id: sessionId },
        }
      }),
    ).toThrow('spoofed PostHog request: unverified distinct id was trusted')
  })

  it('accepts the shared realtime token signer', async () => {
    await expect(
      assertRealtimeTokenConformance((subject, claims) => signRealtimeToken(subject, claims, { secret }), { secret }),
    ).resolves.toBeUndefined()
  })

  it('identifies a token signed with a secret Centrifugo does not share', async () => {
    await expect(
      assertRealtimeTokenConformance((subject, claims) => signRealtimeToken(subject, claims, { secret: 'other-secret' }), { secret }),
    ).rejects.toThrow('realtime token signature: token is not signed with the shared Centrifugo secret')
  })

  it('identifies a token that outlives the connection it authorizes', async () => {
    await expect(
      assertRealtimeTokenConformance((subject, claims) => signRealtimeToken(subject, claims, { secret, ttlSeconds: 60 * 60 * 24 }), {
        secret,
      }),
    ).rejects.toThrow('realtime token expiry: token outlives the 3600 second maximum')
  })

  it('identifies a signer that grants every subject the same identity', async () => {
    await expect(
      assertRealtimeTokenConformance((_subject, claims) => signRealtimeToken('person-123', claims, { secret }), { secret }),
    ).rejects.toThrow('realtime token subject: every subject received the same identity')
  })

  it('identifies an unsigned token', async () => {
    await expect(
      assertRealtimeTokenConformance(
        (subject) => `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: subject, channel: 'room:1', exp: 2 ** 40 })}.`,
        { secret },
      ),
    ).rejects.toThrow('realtime token algorithm: expected HS256, received "none"')
  })
})

const secret = 'centrifugo-shared-secret'

function encode(value: unknown) {
  return btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}
