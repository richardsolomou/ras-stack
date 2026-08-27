export type CentrifugoPublisherOptions = {
  apiUrl: string
  apiKey: string
  fetch?: typeof fetch
  timeoutMs?: number
  retryMs?: number
  maxRetries?: number
  maxConcurrentChannels?: number
  maxPendingChannels?: number
  onError: (error: unknown, channel: string) => void
  onRetry?: (error: unknown, channel: string) => void
}

type PendingPublication = { dirty: boolean; data: unknown; running: boolean }

export class CentrifugoPublisher {
  private readonly pending = new Map<string, PendingPublication>()
  private readonly queue: string[] = []
  private readonly idleWaiters = new Set<() => void>()
  private readonly request: typeof fetch
  private readonly maxConcurrentChannels: number
  private readonly maxPendingChannels: number
  private active = 0
  private closed = false

  constructor(private readonly options: CentrifugoPublisherOptions) {
    this.request = options.fetch ?? fetch
    this.maxConcurrentChannels = positiveInteger(options.maxConcurrentChannels ?? 8, 'maxConcurrentChannels')
    this.maxPendingChannels = positiveInteger(options.maxPendingChannels ?? 1_024, 'maxPendingChannels')
  }

  publish(channel: string, data: unknown) {
    if (!this.options.apiUrl) return false
    if (this.closed) {
      this.reportError(new Error('Realtime publisher is closed'), channel)
      return false
    }
    const pending = this.pending.get(channel)
    if (pending) {
      pending.dirty = true
      pending.data = data
      return true
    }
    if (this.pending.size >= this.maxPendingChannels) {
      this.reportError(new Error('Realtime publisher queue is full'), channel)
      return false
    }

    const state = { dirty: true, data, running: false }
    this.pending.set(channel, state)
    this.queue.push(channel)
    this.pump()
    return true
  }

  idle() {
    if (this.isIdle()) return Promise.resolve()
    return new Promise<void>((resolve) => this.idleWaiters.add(resolve))
  }

  async close() {
    this.closed = true
    await this.idle()
  }

  private pump() {
    while (this.active < this.maxConcurrentChannels) {
      const channel = this.queue.shift()
      if (!channel) break
      const state = this.pending.get(channel)
      if (!state || state.running) continue
      state.running = true
      this.active++
      void this.flush(channel, state).finally(() => {
        this.active--
        this.pump()
        this.resolveIdle()
      })
    }
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
    if (failure) {
      if (state.dirty) {
        this.pending.set(channel, { dirty: true, data: state.data, running: false })
        this.queue.push(channel)
        this.pump()
      }
      this.reportError(failure, channel)
    }
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

  private reportError(error: unknown, channel: string) {
    try {
      this.options.onError(error, channel)
    } catch {}
  }

  private isIdle() {
    return this.pending.size === 0 && this.active === 0 && this.queue.length === 0
  }

  private resolveIdle() {
    if (!this.isIdle()) return
    for (const resolve of this.idleWaiters) resolve()
    this.idleWaiters.clear()
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

function positiveInteger(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${name} must be a positive integer`)
  return value
}
