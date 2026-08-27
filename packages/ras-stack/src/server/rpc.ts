export type RpcErrorContext = { method?: string; path?: string }
export type RpcLogger = (error: unknown, context: RpcErrorContext, request?: Request) => void | Promise<void>

export type RpcOptions = {
  getRequest?: () => Request
  requireMutation?: (request: Request) => void
  logError?: RpcLogger
}

export function createRpc(options: RpcOptions = {}) {
  async function rpc<T>(work: () => Promise<T> | T): Promise<T> {
    try {
      return await work()
    } catch (error) {
      if (error instanceof Response) throw new Error((await error.text()) || `request failed (${error.status})`, { cause: error })
      const request = resolveRequest(options.getRequest)
      try {
        await options.logError?.(error, requestContext(request), request)
      } catch {}
      throw error
    }
  }

  function mutationRpc<T>(work: () => Promise<T> | T, request = options.getRequest?.()) {
    return rpc(() => {
      if (!request) throw new Error('mutation request is unavailable')
      options.requireMutation?.(request)
      return work()
    })
  }

  return { rpc, mutationRpc }
}

function resolveRequest(getRequest: (() => Request) | undefined) {
  try {
    return getRequest?.()
  } catch {
    return undefined
  }
}

function requestContext(request: Request | undefined): RpcErrorContext {
  return request ? { method: request.method, path: new URL(request.url).pathname } : {}
}
