import { describe, expect, it } from 'vitest'
import { randomId, randomToken } from './random'

describe('random', () => {
  it('creates URL-safe tokens of the requested entropy', () => {
    expect(randomToken(16)).toMatch(/^[A-Za-z0-9_-]{22}$/)
  })

  it('creates shorter ids', () => {
    expect(randomId()).toMatch(/^[A-Za-z0-9_-]{11}$/)
  })

  it('rejects an empty token', () => {
    expect(() => randomToken(0)).toThrow('token bytes must be a positive integer')
  })
})
