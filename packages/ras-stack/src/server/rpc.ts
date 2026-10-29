import { currentServerFunction } from './server-function.js'

/** Where a failure happened: the request, the server function it ran when the identity middleware names it, and the status of a thrown `Response`. */
export type RpcErrorContext = { method?: string; path?: string; function?: string; status?: number }
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
      } catch (thrown) {
        const status = thrown instanceof Response ? thrown.status : undefined
        const error =
          thrown instanceof Response ? new Error((await thrown.text()) || `request failed (${thrown.status})`, { cause: thrown }) : thrown
        // A 4xx answer is the caller's to fix; a 5xx one, such as an unreachable upstream, is the server's.
        if (status === undefined || status >= 500) {
          try {
            await options.logError?.(error, requestContext(request, status), request)
          } catch {}
        }
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

function requestContext(request: Request | undefined, status: number | undefined): RpcErrorContext {
  const name = currentServerFunction()?.name
  return {
    ...(request ? { method: request.method, path: new URL(request.url).pathname } : {}),
    ...(name ? { function: name } : {}),
    ...(status === undefined ? {} : { status }),
  }
}
