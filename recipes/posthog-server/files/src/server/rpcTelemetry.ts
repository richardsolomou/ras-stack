import type { RpcErrorContext } from './rpc'
import { currentServerFunction } from './serverFunction'
import { requestContext, type Telemetry } from './telemetry'

/**
 * Runs a server function's work inside one server span, linked to the browser's trace and session, and records its
 * request count and duration. A thrown 4xx `Response` is an intended answer: it counts as `refused` and leaves the span
 * unfailed, so a signed-out caller's 401 does not read as a server error.
 */
export async function observeServerFunction<T>(
  telemetry: Telemetry,
  request: Request | undefined,
  work: () => Promise<T>,
  authenticatedDistinctId?: string,
): Promise<T> {
  if (!request) return work()
  const { posthog } = telemetry
  const method = request.method.toUpperCase()
  const identity = currentServerFunction()
  // Metric attributes stay low-cardinality: a function name is bounded by the application's code, unlike a URL or caller.
  const attributes: Record<string, string> = identity ? { method, function: identity.name } : { method }
  const parent = request.headers.get('traceparent')
  const settled = await posthog.withContext(requestContext(request, authenticatedDistinctId), () =>
    posthog.withSpan('server_function', { kind: 'server', ...(parent ? { parent } : {}) }, async (span) => {
      const startedAt = performance.now()
      span.setAttribute('http.request.method', method)
      if (identity) span.setAttributes({ 'code.function.name': identity.name, 'code.file.path': identity.filename })
      let outcome = 'error'
      try {
        const value = await work()
        outcome = 'success'
        return { value }
      } catch (error) {
        const status = responseStatus(error)
        if (status !== undefined) span.setAttribute('http.response.status_code', status)
        if (status === undefined || status >= 500) throw error
        outcome = status >= 400 ? 'refused' : 'success'
        // Returned rather than thrown, so the span does not record an intended answer as its failure.
        return { refusal: error }
      } finally {
        span.setAttribute('server.function.outcome', outcome)
        posthog.metrics.count('server_function.requests', 1, { attributes: { ...attributes, outcome } })
        posthog.metrics.histogram('server_function.duration', performance.now() - startedAt, { unit: 'ms', attributes })
      }
    }),
  )
  if ('refusal' in settled) throw settled.refusal
  return settled.value
}

/**
 * Reports a server function failure to the server log and to PostHog as an exception and an error log, carrying only
 * the request method and path, the function name, and a thrown `Response`'s status.
 */
export function reportServerFunctionFailure(telemetry: Telemetry, error: unknown, context: RpcErrorContext) {
  console.error({ event: 'server_function_failed', ...context, error })
  const properties = {
    ...(context.method ? { request_method: context.method } : {}),
    ...(context.path ? { request_path: context.path } : {}),
    ...(context.function ? { server_function: context.function } : {}),
    ...(context.status === undefined ? {} : { response_status: context.status }),
  }
  try {
    telemetry.posthog.captureException(error, undefined, properties)
    telemetry.log('error', 'server function failed', properties)
  } catch (telemetryError) {
    // The application's failure is the one the caller must see.
    console.error({ event: 'telemetry_failed', error: telemetryError })
  }
}

/** The status of a thrown `Response`, which `rpc` turns into an `Error` whose cause is that response. */
function responseStatus(error: unknown) {
  const response = error instanceof Error ? error.cause : error
  return response instanceof Response ? response.status : undefined
}
