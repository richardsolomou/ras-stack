import { describe, expect, it } from 'vitest'
import { authFailureMessage, classifySignInFailure } from './client.js'

describe('client authentication failures', () => {
  it('prioritizes rate limiting over a credential error code', () => {
    expect(classifySignInFailure({ status: 429, code: 'INVALID_EMAIL_OR_PASSWORD' })).toBe('rate_limited')
  })

  it('recognizes status and code credential failures', () => {
    expect([classifySignInFailure({ status: 401 }), classifySignInFailure({ code: 'INVALID_EMAIL_OR_PASSWORD' })]).toEqual([
      'invalid_credentials',
      'invalid_credentials',
    ])
  })

  it('classifies transport and server failures separately', () => {
    expect([classifySignInFailure(undefined), classifySignInFailure({ status: 500 })]).toEqual(['error', 'error'])
  })

  it('uses a non-empty auth error message or the application fallback', () => {
    expect([authFailureMessage({ message: 'Account disabled.' }, 'fallback'), authFailureMessage({ message: '' }, 'fallback')]).toEqual([
      'Account disabled.',
      'fallback',
    ])
  })
})
