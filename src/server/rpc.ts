export type RpcLogger = (error: unknown, context: { method?: string; path?: string }) => void

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
      options.logError?.(error, requestContext(options.getRequest))
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

function requestContext(getRequest: (() => Request) | undefined) {
  try {
    const request = getRequest?.()
    return request ? { method: request.method, path: new URL(request.url).pathname } : {}
  } catch {
    return {}
  }
}
