import { getRequest } from '@tanstack/react-start/server'
import { requireSameOrigin, type OriginOptions } from '../auth/origins.js'
import { healthResponse, type HealthResponseOptions } from '../server/health.js'
import { createRpc, type RpcOptions } from '../server/rpc.js'

export type TanStackRpcOptions = Omit<RpcOptions, 'getRequest'> & Pick<RpcOptions, 'getRequest'>

export function createTanStackRpc(options: TanStackRpcOptions = {}) {
  return createRpc({ ...options, getRequest: options.getRequest ?? getRequest })
}

export function requireTanStackMutationOrigin(options: OriginOptions = {}, request = getRequest()) {
  return requireSameOrigin(request, options)
}

export function tanStackHealthHandler(check: () => void | Promise<void>, options: HealthResponseOptions = {}) {
  return () => healthResponse(check, options)
}
