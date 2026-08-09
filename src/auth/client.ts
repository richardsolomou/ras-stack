export type AuthFailure = { status?: number; code?: string; message?: string } | null | undefined
export type SignInFailureReason = 'invalid_credentials' | 'rate_limited' | 'error'

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
