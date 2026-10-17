export type HealthFailure = { code: string; message: string }

export type HealthResponseOptions = {
  /** Maps a failed check to the code and message the response may expose; the cause itself never leaves the server. */
  failure?: (error: unknown) => HealthFailure
}

export async function healthResponse(check: () => Promise<void> | void, options: HealthResponseOptions = {}) {
  try {
    await check()
    return Response.json({ ok: true })
  } catch (error) {
    const failure = options.failure?.(error)
    return Response.json(
      failure ? { ok: false, error: failure.message, code: failure.code } : { ok: false, error: 'health check failed' },
      { status: 503 },
    )
  }
}

export const databaseHealthFailure = (): HealthFailure => ({ code: 'database_unavailable', message: 'database unavailable' })
