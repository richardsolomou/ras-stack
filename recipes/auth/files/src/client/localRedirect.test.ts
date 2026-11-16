import { describe, expect, it } from 'vitest'
import { localRedirectPath } from './localRedirect'

describe('localRedirectPath', () => {
  it.each(['/rosters', '/battles/123?round=2#score'])('keeps the local destination %s', (destination) => {
    expect(localRedirectPath(destination)).toBe(destination)
  })

  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '\\evil.example',
    '/a/..//evil.example',
    '/a/%2e%2e//evil.example',
    '',
    undefined,
  ])('rejects %s', (destination) => {
    expect(localRedirectPath(destination)).toBeUndefined()
  })
})
