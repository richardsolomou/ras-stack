import { createMiddleware } from '@tanstack/react-start'
import { canonicalRedirect, type CanonicalRedirectOptions } from '../server/canonical-host.js'
import { withServerFunction } from '../server/server-function.js'

export function canonicalHostMiddleware(resolveOptions: () => CanonicalRedirectOptions) {
  return createMiddleware({ type: 'request' }).server(({ request, next }) => {
    const redirect = canonicalRedirect(request.url, resolveOptions())
    return redirect ? Response.redirect(redirect, 301) : next()
  })
}

/** Names each server function for telemetry recorded while it runs, such as the RPC observer's span and metrics. */
export function serverFunctionIdentityMiddleware() {
  return createMiddleware({ type: 'function' }).server(({ serverFnMeta, next }) =>
    withServerFunction({ name: serverFnMeta.name, filename: serverFnMeta.filename }, next),
  )
}

/**
 * A tab opened before a deploy can call a server function the deploy removed. TanStack answers with a JSON 500 that
 * its client returns as a successful result, so this replaces it with a plain-text 404 the client throws with `message`.
 */
export function staleServerFunctionMiddleware(message: string) {
  return createMiddleware({ type: 'request' }).server(async ({ handlerType, next }) => {
    if (handlerType !== 'serverFn') return next()
    try {
      return await next()
    } catch (error) {
      if (!(error instanceof Error && error.message.startsWith('Server function info not found for '))) throw error
      return new Response(message, { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } })
    }
  })
}
