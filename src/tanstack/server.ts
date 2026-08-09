import { getRequest } from '@tanstack/react-start/server'
import { createMiddleware } from '@tanstack/react-start'
import { requireSameOrigin, type OriginOptions } from '../auth/index.js'
import {
  canonicalRedirect,
  createRpc,
  healthResponse,
  type CanonicalRedirectOptions,
  type HealthResponseOptions,
  type RpcOptions,
} from '../server/index.js'

export type TanStackRpcOptions = Omit<RpcOptions, 'getRequest'> & Pick<RpcOptions, 'getRequest'>

export function createTanStackRpc(options: TanStackRpcOptions = {}) {
  return createRpc({ ...options, getRequest: options.getRequest ?? getRequest })
}

export function requireTanStackMutationOrigin(options: OriginOptions = {}, request = getRequest()) {
  return requireSameOrigin(request, options)
}

type RequestContext = { request: Request }

export function betterAuthHandlers(resolveAuth: () => { handler(request: Request): Response | Promise<Response> }) {
  const handle = ({ request }: RequestContext) => resolveAuth().handler(request)
  return { GET: handle, POST: handle }
}

export function tanStackHealthHandler(check: () => void | Promise<void>, options: HealthResponseOptions = {}) {
  return () => healthResponse(check, options)
}

export function canonicalHostRequest<T>(request: Request, next: () => T, options: CanonicalRedirectOptions): Response | T {
  const redirect = canonicalRedirect(request.url, options)
  return redirect ? Response.redirect(redirect, 301) : next()
}

export function canonicalHostMiddleware(resolveOptions: () => CanonicalRedirectOptions) {
  return createMiddleware({ type: 'request' }).server(({ request, next }) => {
    return canonicalHostRequest(request, next, resolveOptions())
  })
}
