export const POSTHOG_DISTINCT_ID_HEADER = 'x-posthog-distinct-id'
export const POSTHOG_SESSION_ID_HEADER = 'x-posthog-session-id'

export type PostHogRequestContext = {
  distinctId?: string
  sessionId?: string
  properties: { $session_id?: string }
}

export function postHogRequestContext(
  request: Request,
  options: { authenticatedDistinctId?: string; allowAnonymousDistinctId?: boolean } = {},
): PostHogRequestContext {
  const claimedDistinctId = postHogIdentifier(request.headers.get(POSTHOG_DISTINCT_ID_HEADER))
  const sessionId = postHogIdentifier(request.headers.get(POSTHOG_SESSION_ID_HEADER))
  const distinctId = options.authenticatedDistinctId
    ? claimedDistinctId === options.authenticatedDistinctId
      ? claimedDistinctId
      : undefined
    : options.allowAnonymousDistinctId
      ? claimedDistinctId
      : undefined
  return {
    ...(distinctId ? { distinctId } : {}),
    ...(sessionId ? { sessionId } : {}),
    properties: sessionId ? { $session_id: sessionId } : {},
  }
}

export function postHogIdentifier(value: string | null | undefined) {
  return value && /^[A-Za-z0-9._:@|+-]{1,128}$/.test(value) ? value : undefined
}
