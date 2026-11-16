import { describe, expect, it, vi } from 'vitest'
import { spacetimeConnection } from './spacetime'

const uri = 'ws://127.0.0.1:3001'

function memoryStorage(token?: string) {
  const items = new Map(token ? [['spacetime:token', token]] : [])
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  }
}

/** Builds a connection whose socket fails with `failure`, and resolves with the token it presented once the failure is reported. */
function attempt(builder: ReturnType<typeof spacetimeConnection>, failure: Error) {
  return new Promise<string | undefined>((resolve) => {
    let presented: string | undefined
    builder
      .withWSFn((args) => {
        presented = args.authToken
        return Promise.reject(failure)
      })
      .onConnectError(() => resolve(presented))
      .build()
  })
}

const rejected = Object.assign(new Error('Failed to verify token: 401 Unauthorized'), { name: 'WebSocketTokenError', status: 401 })

describe('spacetimeConnection', () => {
  it('refuses to start without the database settings', () => {
    expect(() => spacetimeConnection(uri, '', memoryStorage())).toThrow('VITE_SPACETIME_URL and VITE_SPACETIME_DATABASE must be set')
  })

  it('presents the stored token', async () => {
    expect(await attempt(spacetimeConnection(uri, 'app', memoryStorage('stored'), vi.fn()), new Error('offline'))).toBe('stored')
  })

  it('keeps the stored token when the server is unreachable', async () => {
    const storage = memoryStorage('stored')
    await attempt(spacetimeConnection(uri, 'app', storage, vi.fn()), new Error('offline'))
    expect(storage.getItem('spacetime:token')).toBe('stored')
  })

  it('forgets a token the server rejects and reloads to connect anew', async () => {
    const storage = memoryStorage('stale')
    const reload = vi.fn()
    await attempt(spacetimeConnection(uri, 'app', storage, reload), rejected)
    expect([storage.getItem('spacetime:token'), reload.mock.calls.length]).toEqual([null, 1])
  })

  it('does not reload when an anonymous connection is refused', async () => {
    const reload = vi.fn()
    await attempt(spacetimeConnection(uri, 'app', memoryStorage(), reload), rejected)
    expect(reload).not.toHaveBeenCalled()
  })
})
