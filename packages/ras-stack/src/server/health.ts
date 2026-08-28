import { infrastructureFailure, type InfrastructureFailure } from './errors.js'

export type HealthResponseOptions = {
  errorMessage?: (error: unknown) => string
  failure?: (error: unknown) => InfrastructureFailure
}

export async function healthResponse(check: () => Promise<void> | void, options: HealthResponseOptions = {}) {
  try {
    await check()
    return Response.json({ ok: true })
  } catch (error) {
    if (options.failure) {
      const failure = options.failure(error)
      return Response.json({ ok: false, error: failure.message, code: failure.code }, { status: 503 })
    }
    return Response.json({ ok: false, error: options.errorMessage?.(error) ?? 'health check failed' }, { status: 503 })
  }
}

export const databaseHealthFailure = (error: unknown) =>
  infrastructureFailure(error, { code: 'database_unavailable', message: 'database unavailable', retryable: true })
