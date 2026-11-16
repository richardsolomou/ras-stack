import { createCsrfMiddleware, createMiddleware } from '@tanstack/react-start'
import { contentSecurityPolicy } from './contentSecurityPolicy'
import { acceptedOrigins, configuredOrigin } from './origins'
import { withServerFunction } from './serverFunction'

// Health checks reach the container by its internal name, so they must not be sent to the public one.
const pathsServedOnAnyHost = new Set(['/api/health'])

export function canonicalRedirect(requestUrl: string, canonicalOrigin: string | undefined) {
  if (!canonicalOrigin) return null
  try {
    const canonical = new URL(canonicalOrigin)
    const incoming = new URL(requestUrl)
    if (incoming.host === canonical.host || pathsServedOnAnyHost.has(incoming.pathname)) return null
    // A sibling process calling over loopback is not a visitor on the wrong hostname, and its client may drop the method on a redirect.
    if (loopback(incoming.hostname)) return null
    return new URL(incoming.pathname + incoming.search + incoming.hash, canonical.origin).toString()
  } catch {
    return null
  }
}

export function loopback(hostname: string) {
  return hostname === 'localhost' || hostname === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(hostname)
}

/** Sends a request for any other hostname to `APP_URL`, keeping the path; does nothing without `APP_URL`. */
export const canonicalHost = createMiddleware({ type: 'request' }).server(({ request, next }) => {
  const redirect = canonicalRedirect(request.url, configuredOrigin())
  return redirect ? Response.redirect(redirect, 301) : next()
})

export const securityHeaders: Record<string, string> = {
  'content-security-policy': Object.entries(contentSecurityPolicy)
    .map(([directive, sources]) => [directive, ...sources].join(' '))
    .join('; '),
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
}

function addSecurityHeaders(headers: Headers) {
  for (const [name, value] of Object.entries(securityHeaders)) if (!headers.has(name)) headers.set(name, value)
}

/** Adds `securityHeaders` to every response Start renders, keeping any a route set itself. */
export const securityHeadersMiddleware = createMiddleware({ type: 'request' }).server(async ({ next }) => {
  const result = await next()
  try {
    addSecurityHeaders(result.response.headers)
    return result
  } catch {
    // `Response.redirect()` and `fetch()` responses have immutable headers, so those are copied first.
    const response = new Response(result.response.body, result.response)
    addSecurityHeaders(response.headers)
    return response
  }
})

/** TanStack's server function CSRF check, accepting the same origins as `requireSameOrigin` when a browser omits `Sec-Fetch-Site`. */
export const csrf = createCsrfMiddleware({
  filter: ({ handlerType }) => handlerType === 'serverFn',
  origin: (origin, { request }) => acceptedOrigins(request).includes(origin),
})

/**
 * A tab opened before a deploy can call a server function the deploy removed. TanStack answers with a JSON 500 that its
 * client returns as a successful result, so this replaces it with a plain-text 404 the client throws with this message.
 */
export const staleServerFunctions = createMiddleware({ type: 'request' }).server(async ({ handlerType, next }) => {
  if (handlerType !== 'serverFn') return next()
  try {
    return await next()
  } catch (error) {
    if (!(error instanceof Error && error.message.startsWith('Server function info not found for '))) throw error
    return new Response('The app has been updated. Refresh the page to continue.', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }
})

/** Names each server function for logs and telemetry recorded while it runs. */
export const serverFunctionIdentity = createMiddleware({ type: 'function' }).server(({ serverFnMeta, next }) =>
  withServerFunction({ name: serverFnMeta.name, filename: serverFnMeta.filename }, next),
)
