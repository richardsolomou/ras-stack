import { describe, expect, it } from 'vitest'
import { spacetimeConnectSources } from './spacetimeOrigin'

describe('SpacetimeDB connect sources', () => {
  it('allows HTTPS and secure WebSockets to a hosted database', () => {
    expect(spacetimeConnectSources('wss://spacetime.example')).toEqual(['https://spacetime.example', 'wss://spacetime.example'])
  })

  it('allows plain HTTP and WebSockets to a local server', () => {
    expect(spacetimeConnectSources('http://127.0.0.1:3001')).toEqual(['http://127.0.0.1:3001', 'ws://127.0.0.1:3001'])
  })

  it('adds nothing without a URL', () => {
    expect(spacetimeConnectSources(undefined)).toEqual([])
  })
})
