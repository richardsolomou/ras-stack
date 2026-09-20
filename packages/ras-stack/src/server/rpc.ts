export type RpcErrorContext = { method?: string; path?: string }
export type RpcLogger = (error: unknown, context: RpcErrorContext, request?: Request) => void | Promise<void>
export type RpcObserver = <T>(request: Request | undefined, work: () => Promise<T>) => Promise<T>

export type RpcOptions = {
  getRequest?: () => Request
  requireMutation?: (request: Request) => void
  logError?: RpcLogger
  observe?: RpcObserver
}

export function createRpc(options: RpcOptions = {}) {
  async function rpc<T>(work: () => Promise<T> | T): Promise<T> {
    return run(work, resolveRequest(options.getRequest))
  }

  async function run<T>(work: () => Promise<T> | T, request: Request | undefined): Promise<T> {
    const execute = async () => {
      try {
        return await work()
      } catch (error) {
        if (error instanceof Response) throw new Error((await error.text()) || `request failed (${error.status})`, { cause: error })
        try {
          await options.logError?.(error, requestContext(request), request)
        } catch {}
        throw error
      }
    }
    return options.observe ? options.observe(request, execute) : execute()
  }

  function mutationRpc<T>(work: () => Promise<T> | T, request = resolveRequest(options.getRequest)) {
    return run(() => {
      if (!request) throw new Error('mutation request is unavailable')
      options.requireMutation?.(request)
      return work()
    }, request)
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
