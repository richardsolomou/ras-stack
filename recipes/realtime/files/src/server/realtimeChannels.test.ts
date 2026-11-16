import { describe, expect, it } from 'vitest'
import { channelPolicy } from './realtimeChannels'

describe('channel policy', () => {
  it('subscribes a signed-in viewer to their own channel', () => {
    expect(channelPolicy.serverChannels({ id: 'user-1' })).toEqual(['user:user-1'])
  })

  it('gives an anonymous viewer no server-side channels', () => {
    expect(channelPolicy.serverChannels({ id: '' })).toEqual([])
  })

  it('lets anyone follow a public channel', () => {
    expect(channelPolicy.canSubscribe({ id: '' }, 'updates:news')).toBe(true)
  })

  it('refuses another viewer’s channel from the browser', () => {
    expect(channelPolicy.canSubscribe({ id: 'user-1' }, 'user:someone-else')).toBe(false)
  })
})
