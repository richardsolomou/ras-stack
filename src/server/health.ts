export type HealthResponseOptions = { errorMessage?: (error: unknown) => string }

export async function healthResponse(check: () => Promise<void> | void, options: HealthResponseOptions = {}) {
  try {
    await check()
    return Response.json({ ok: true })
  } catch (error) {
    return Response.json({ ok: false, error: options.errorMessage?.(error) ?? 'health check failed' }, { status: 503 })
  }
}
