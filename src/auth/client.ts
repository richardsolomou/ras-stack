export type AuthFailure = { status?: number; code?: string; message?: string } | null | undefined
export type AuthCallbackFailureReason =
  | 'account_already_linked'
  | 'account_not_linked'
  | 'email_mismatch'
  | 'error'
  | 'invalid_token'
  | 'token_expired'
export type SignInFailureReason = 'invalid_credentials' | 'rate_limited' | 'error'

const REDIRECT_ORIGIN = 'https://ras-stack.invalid'

export function classifyAuthCallbackFailure(error: unknown): AuthCallbackFailureReason {
  if (typeof error !== 'string') return 'error'
  switch (error.trim().toLowerCase()) {
    case 'account_not_linked':
    case 'account not linked':
    case 'unable_to_link_account':
      return 'account_not_linked'
    case "email_doesn't_match":
    case 'email_does_not_match':
    case 'email_mismatch':
      return 'email_mismatch'
    case 'account_already_linked_to_different_user':
    case 'social_account_already_linked':
      return 'account_already_linked'
    case 'invalid_token':
      return 'invalid_token'
    case 'token_expired':
      return 'token_expired'
    default:
      return 'error'
  }
}

export function classifySignInFailure(failure: unknown): SignInFailureReason {
  if (!failure || typeof failure !== 'object') return 'error'
  const status = 'status' in failure ? failure.status : undefined
  const code = 'code' in failure ? failure.code : undefined
  if (status === 429) return 'rate_limited'
  if (status === 401 || code === 'INVALID_EMAIL_OR_PASSWORD') return 'invalid_credentials'
  return 'error'
}

export function authFailureMessage(failure: unknown, fallback: string) {
  if (!failure || typeof failure !== 'object' || !('message' in failure)) return fallback
  return typeof failure.message === 'string' && failure.message.trim() ? failure.message : fallback
}

export function localRedirectPath(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('/')) return undefined
  try {
    const resolved = new URL(value, REDIRECT_ORIGIN)
    if (resolved.origin !== REDIRECT_ORIGIN) return undefined
    return `${resolved.pathname}${resolved.search}${resolved.hash}`
  } catch {
    return undefined
  }
}
