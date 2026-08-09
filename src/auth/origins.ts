export type OriginOptions = {
  configured?: readonly (string | undefined)[]
  allowReferer?: boolean
  trustForwardedHeaders?: boolean
}

export function parseOrigin(value: string | undefined) {
  if (!value?.trim()) return undefined
  try {
    return new URL(value).origin
  } catch {
    return undefined
  }
}

export function forwardedOrigin(request: Request) {
  const host = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() || request.headers.get('host')?.trim()
  const protocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  return host && (protocol === 'http' || protocol === 'https') ? parseOrigin(`${protocol}://${host}`) : undefined
}

export function acceptedOrigins(request: Request, options: OriginOptions = {}) {
  return [
    new URL(request.url).origin,
    ...(options.trustForwardedHeaders ? [forwardedOrigin(request)] : []),
    ...(options.configured ?? []).map(parseOrigin),
  ].filter((origin): origin is string => Boolean(origin))
}

export function validSameOriginRequest(request: Request, options: OriginOptions = {}) {
  const origin =
    request.headers.get('origin') || (options.allowReferer ? parseOrigin(request.headers.get('referer') ?? undefined) : undefined)
  const site = request.headers.get('sec-fetch-site')
  return Boolean(origin && (!site || site === 'same-origin') && acceptedOrigins(request, options).includes(origin))
}

export function requireSameOrigin(request: Request, options: OriginOptions = {}) {
  if (!validSameOriginRequest(request, options)) throw new Response('cross-origin mutation rejected', { status: 403 })
}

export function trustedOrigins(options: OriginOptions = {}) {
  return (request?: Request) =>
    request ? acceptedOrigins(request, options).filter((origin) => origin !== new URL(request.url).origin) : []
}
