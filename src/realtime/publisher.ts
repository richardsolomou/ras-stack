export type CentrifugoPublisherOptions = {
  apiUrl: string
  apiKey: string
  fetch?: typeof fetch
  timeoutMs?: number
  retryMs?: number
  maxRetries?: number
  onError: (error: unknown, channel: string) => void
  onRetry?: (error: unknown, channel: string) => void
}

type PendingPublication = { dirty: boolean; data: unknown }

export class CentrifugoPublisher {
  private readonly pending = new Map<string, PendingPublication>()
  private readonly request: typeof fetch

  constructor(private readonly options: CentrifugoPublisherOptions) {
    this.request = options.fetch ?? fetch
  }

  publish(channel: string, data: unknown) {
    if (!this.options.apiUrl) return
    const pending = this.pending.get(channel)
    if (pending) {
      pending.dirty = true
      pending.data = data
      return
    }

    const state = { dirty: true, data }
    this.pending.set(channel, state)
    void this.flush(channel, state)
  }

  private async flush(channel: string, state: PendingPublication) {
    let failure: unknown
    try {
      while (state.dirty) {
        state.dirty = false
        // Publications for one channel must preserve mutation order.
        // oxlint-disable-next-line no-await-in-loop
        await this.deliver(channel, state.data)
      }
    } catch (error) {
      failure = error
    } finally {
      if (this.pending.get(channel) === state) this.pending.delete(channel)
    }
    if (failure) this.options.onError(failure, channel)
  }

  private async deliver(channel: string, data: unknown) {
    const maxRetries = this.options.maxRetries ?? 3
    for (let retries = 0; ; retries++) {
      try {
        // Retrying must finish before a later publication can overtake this one.
        // oxlint-disable-next-line no-await-in-loop
        await this.deliverOnce(channel, data)
        return
      } catch (error) {
        if (!(error instanceof TransientPublishError)) throw error
        if (retries >= maxRetries) throw error
        this.options.onRetry?.(error, channel)
        // oxlint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, this.options.retryMs ?? 1_000))
      }
    }
  }

  private async deliverOnce(channel: string, data: unknown) {
    let response: Response
    try {
      response = await this.request(`${this.options.apiUrl.replace(/\/$/, '')}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': this.options.apiKey },
        body: JSON.stringify({ channel, data }),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 5_000),
      })
    } catch (error) {
      if (error instanceof TypeError || isTimeout(error))
        throw new TransientPublishError('Realtime publish request failed', { cause: error })
      throw error
    }

    if (!response.ok) {
      const message = `Realtime publish failed with status ${response.status}`
      if (response.status >= 500 || response.status === 429) throw new TransientPublishError(message)
      throw new Error(message)
    }

    const result: unknown = await response.json()
    const error = centrifugoError(result)
    if (!error) return
    const message = `Realtime publish failed: ${error.message ?? `code ${error.code ?? 'unknown'}`}`
    if (error.code === 100) throw new TransientPublishError(message)
    throw new Error(message)
  }
}

class TransientPublishError extends Error {}

function isTimeout(error: unknown) {
  return error instanceof DOMException && error.name === 'TimeoutError'
}

function centrifugoError(result: unknown): { code?: number; message?: string } | undefined {
  if (!result || typeof result !== 'object' || !('error' in result) || !result.error || typeof result.error !== 'object') return undefined
  const code = 'code' in result.error && typeof result.error.code === 'number' ? result.error.code : undefined
  const message = 'message' in result.error && typeof result.error.message === 'string' ? result.error.message : undefined
  return { ...(code === undefined ? {} : { code }), ...(message === undefined ? {} : { message }) }
}
