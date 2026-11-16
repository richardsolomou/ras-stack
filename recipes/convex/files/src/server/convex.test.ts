import { describe, expect, it } from 'vitest'
import { convexConnectSources } from './convex'

describe('convexConnectSources', () => {
  it('allows HTTPS and secure WebSockets to a cloud deployment', () => {
    expect(convexConnectSources('https://happy-otter-123.convex.cloud')).toEqual([
      'https://happy-otter-123.convex.cloud',
      'wss://happy-otter-123.convex.cloud',
    ])
  })

  it('allows plain HTTP and WebSockets to a local deployment', () => {
    expect(convexConnectSources('http://127.0.0.1:3210')).toEqual(['http://127.0.0.1:3210', 'ws://127.0.0.1:3210'])
  })

  it('adds nothing without a deployment URL', () => {
    expect(convexConnectSources(undefined)).toEqual([])
  })
})
