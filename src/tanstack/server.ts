import { getRequest } from '@tanstack/react-start/server'
import { requireSameOrigin, type OriginOptions } from '../auth/index.js'
import { createRpc, type RpcOptions } from '../server/index.js'

export type TanStackRpcOptions = Omit<RpcOptions, 'getRequest'> & Pick<RpcOptions, 'getRequest'>

export function createTanStackRpc(options: TanStackRpcOptions = {}) {
  return createRpc({ ...options, getRequest: options.getRequest ?? getRequest })
}

export function requireTanStackMutationOrigin(options: OriginOptions = {}, request = getRequest()) {
  return requireSameOrigin(request, options)
}
