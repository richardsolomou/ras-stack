import { getRequest } from '@tanstack/react-start/server'
import { requireSameOrigin, type OriginOptions } from '../auth/origins.js'
import { createRpc, healthResponse, type HealthResponseOptions, type RpcOptions } from '../server/index.js'
export { canonicalHostMiddleware, canonicalHostRequest } from './middleware.js'

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
