import { describe, expect, it } from 'vitest'
import { authFailureMessage, classifyAuthCallbackFailure, classifySignInFailure, localRedirectPath } from './client.js'

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

describe('auth callback failures', () => {
  it.each(["email_doesn't_match", 'email_does_not_match', 'EMAIL_MISMATCH'])('normalizes the email mismatch code %s', (error) => {
    expect(classifyAuthCallbackFailure(error)).toBe('email_mismatch')
  })

  it.each(['account_not_linked', 'account not linked', 'unable_to_link_account'])('normalizes the unlinked account code %s', (error) => {
    expect(classifyAuthCallbackFailure(error)).toBe('account_not_linked')
  })

  it('classifies account ownership and token failures', () => {
    expect([
      classifyAuthCallbackFailure('account_already_linked_to_different_user'),
      classifyAuthCallbackFailure('SOCIAL_ACCOUNT_ALREADY_LINKED'),
      classifyAuthCallbackFailure('INVALID_TOKEN'),
      classifyAuthCallbackFailure('TOKEN_EXPIRED'),
    ]).toEqual(['account_already_linked', 'account_already_linked', 'invalid_token', 'token_expired'])
  })

  it('classifies unknown and missing callback errors generically', () => {
    expect([classifyAuthCallbackFailure('provider_error'), classifyAuthCallbackFailure(undefined)]).toEqual(['error', 'error'])
  })
})

describe('local auth redirects', () => {
  it.each(['/rosters', '/battles/123?round=2#score'])('preserves the local destination %s', (destination) => {
    expect(localRedirectPath(destination)).toBe(destination)
  })

  it.each(['https://evil.example', '//evil.example', '/\\evil.example', '\\evil.example', '', undefined])(
    'rejects the unsafe destination %s',
    (destination) => {
      expect(localRedirectPath(destination)).toBeUndefined()
    },
  )
})
