/** The configured public address, such as `https://example.com`, or undefined when unset or invalid. */
export function configuredOrigin() {
  return parseOrigin(process.env.APP_URL)
}

function parseOrigin(value: string | undefined) {
  if (!value?.trim()) return undefined
  try {
    return new URL(value).origin
  } catch {
    return undefined
  }
}

// Any client can send these headers, so they count only behind a proxy that replaces them.
function forwardedOrigin(request: Request) {
  if (process.env.TRUST_PROXY !== 'true') return undefined
  const host = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() || request.headers.get('host')?.trim()
  const protocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  return host && (protocol === 'http' || protocol === 'https') ? parseOrigin(`${protocol}://${host}`) : undefined
}

/** Every origin this request may legitimately come from: its own, the trusted forwarded one, and `APP_URL`. */
export function acceptedOrigins(request: Request) {
  return [new URL(request.url).origin, forwardedOrigin(request), configuredOrigin()].filter((origin): origin is string => Boolean(origin))
}

/** Where users reach the application, for absolute links: `APP_URL`, then the trusted forwarded origin, then the request's own. */
export function publicOrigin(request: Request) {
  return configuredOrigin() ?? forwardedOrigin(request) ?? new URL(request.url).origin
}

/** The extra origins Better Auth's `trustedOrigins` callback should accept for this request. */
export function trustedOrigins(request?: Request) {
  return request ? acceptedOrigins(request).filter((origin) => origin !== new URL(request.url).origin) : []
}

export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get('origin')
  const site = request.headers.get('sec-fetch-site')
  return Boolean(origin && (!site || site === 'same-origin') && acceptedOrigins(request).includes(origin))
}

/** Throws a 403 unless a browser on one of this application's origins sent the request. */
export function requireSameOrigin(request: Request) {
  if (!isSameOriginRequest(request)) throw new Response('cross-origin mutation rejected', { status: 403 })
}
