import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPostHogServerClient, shutdownPostHogServerClient } from './server.js'

const { construct, shutdown } = vi.hoisted(() => ({ construct: vi.fn(), shutdown: vi.fn(async () => undefined) }))

vi.mock('posthog-node', () => ({
  PostHog: class {
    _shutdown = shutdown
    constructor(...arguments_: unknown[]) {
      construct(...arguments_)
    }
  },
}))

describe('PostHog server integration', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does not load a client when telemetry is unconfigured', async () => {
    expect(await createPostHogServerClient(undefined)).toBeUndefined()
    expect(construct).not.toHaveBeenCalled()
  })

  it('creates the native client with exception autocapture and explicit overrides', async () => {
    const client = await createPostHogServerClient(
      {
        projectToken: 'phc_test',
        host: 'https://us.i.posthog.com',
        uiHost: 'https://us.posthog.com',
        assetsHost: 'https://us-assets.i.posthog.com',
      },
      { flushAt: 1, flushInterval: 0 },
    )
    expect(client).toBeDefined()
    expect(construct).toHaveBeenCalledWith('phc_test', {
      host: 'https://us.i.posthog.com',
      enableExceptionAutocapture: true,
      flushAt: 1,
      flushInterval: 0,
    })
  })

  it('awaits the SDK shutdown boundary', async () => {
    const client = await createPostHogServerClient({
      projectToken: 'phc_test',
      host: 'https://us.i.posthog.com',
      uiHost: 'https://us.posthog.com',
      assetsHost: 'https://us-assets.i.posthog.com',
    })
    await shutdownPostHogServerClient(client, 5_000)
    expect(shutdown).toHaveBeenCalledWith(5_000)
  })

  it('rejects an invalid shutdown timeout', async () => {
    await expect(shutdownPostHogServerClient(undefined, -1)).rejects.toThrow('timeoutMs must be a non-negative integer')
  })
})
