import { createMiddleware } from '@tanstack/react-start'
import { canonicalRedirect, type CanonicalRedirectOptions } from '../server/canonical-host.js'

export function canonicalHostRequest<T>(request: Request, next: () => T, options: CanonicalRedirectOptions): Response | T {
  const redirect = canonicalRedirect(request.url, options)
  return redirect ? Response.redirect(redirect, 301) : next()
}

export function canonicalHostMiddleware(resolveOptions: () => CanonicalRedirectOptions) {
  return createMiddleware({ type: 'request' }).server(({ request, next }) => {
    return canonicalHostRequest(request, next, resolveOptions())
  })
}
