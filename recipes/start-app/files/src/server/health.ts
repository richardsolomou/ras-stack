/** A failed dependency, with the stable code and message monitors see; the cause stays in the server log. */
export class HealthCheckFailure extends Error {
  readonly code: string

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options)
    this.code = code
    this.name = 'HealthCheckFailure'
  }
}

/** Runs one dependency's check, so its failure reaches monitors as `code` while others, such as a missing secret, do not. */
export async function checkDependency(code: string, message: string, check: () => unknown) {
  try {
    await check()
  } catch (error) {
    throw new HealthCheckFailure(code, message, { cause: error })
  }
}

export async function healthResponse(check: () => Promise<void> | void) {
  const headers = { 'cache-control': 'no-store' }
  try {
    await check()
    return Response.json({ ok: true }, { headers })
  } catch (error) {
    console.error({ event: 'health_check_failed', error })
    const body =
      error instanceof HealthCheckFailure
        ? { ok: false, error: error.message, code: error.code }
        : { ok: false, error: 'health check failed' }
    return Response.json(body, { status: 503, headers })
  }
}
