import type { RateLimitRule } from '../auth/settings.js'
import { InfrastructureError } from './errors.js'

export type RateLimitCounter = { count: number; resetAt: number }

export type RateLimitStore = {
  increment: (key: string, windowSeconds: number, now: number) => Promise<RateLimitCounter> | RateLimitCounter
}

export type RateLimitDecision = { key: string; remaining: number; resetAt: number }

export type RateLimitOptions = {
  store: RateLimitStore
  rule: RateLimitRule
  identify: (request: Request) => string | undefined
  scope?: string
  onUnidentified?: 'reject' | 'allow'
  onUnavailable?: 'reject' | 'allow'
  now?: () => number
}

export function createRateLimit(options: RateLimitOptions) {
  const scope = options.scope ?? 'default'
  const { window, max } = options.rule
  if (!Number.isSafeInteger(window) || window < 1) throw new RangeError('rate limit window must be a positive integer')
  if (!Number.isSafeInteger(max) || max < 1) throw new RangeError('rate limit max must be a positive integer')

  return async function limit(request: Request): Promise<RateLimitDecision | undefined> {
    const now = Math.floor((options.now?.() ?? Date.now()) / 1000)
    const identity = options.identify(request)
    if (!identity) {
      if ((options.onUnidentified ?? 'reject') === 'allow') return undefined
      throw rejection('unidentified client rejected', 403, window)
    }

    const key = `${scope}:${identity}`
    let counter: RateLimitCounter
    try {
      counter = await options.store.increment(key, window, now)
    } catch (error) {
      if ((options.onUnavailable ?? 'reject') === 'allow') return undefined
      // A store outage is infrastructure rather than a client fault, so it classifies with everything else that is retryable.
      throw new InfrastructureError('rate_limit_unavailable', 'rate limit is temporarily unavailable', { cause: error, retryable: true })
    }

    if (counter.count > max) throw rejection('rate limit exceeded', 429, Math.max(counter.resetAt - now, 1))
    return { key, remaining: max - counter.count, resetAt: counter.resetAt }
  }
}

// Counters live in one process, so this is for development and tests; replicas each enforce their own budget.
export function memoryRateLimitStore(options: { maxKeys?: number } = {}): RateLimitStore {
  const maxKeys = options.maxKeys ?? 10_000
  const counters = new Map<string, RateLimitCounter>()
  return {
    increment(key, windowSeconds, now) {
      const existing = counters.get(key)
      if (existing && existing.resetAt > now) {
        existing.count += 1
        return existing
      }
      if (counters.size >= maxKeys) {
        for (const [candidate, counter] of counters) if (counter.resetAt <= now) counters.delete(candidate)
        // Expiring nothing under a burst of distinct keys would otherwise grow the map without a bound.
        while (counters.size >= maxKeys) counters.delete(counters.keys().next().value!)
      }
      const counter = { count: 1, resetAt: now + windowSeconds }
      counters.set(key, counter)
      return counter
    },
  }
}

// Stores interpolate the table into SQL, and only better-sqlite3 lacks an identifier escape, so the name is validated for both.
export function rateLimitTable(name: string) {
  if (!/^[a-z_][a-z\d_]*$/i.test(name)) throw new Error('rate limit table must be an unquoted SQL identifier')
  return name
}

// A forwarded address is only as trustworthy as the proxy that set it, so reading it stays opt-in.
export function forwardedClientAddress(request: Request, options: { trustForwardedHeaders?: boolean } = {}) {
  if (!options.trustForwardedHeaders) return undefined
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined
}

function rejection(message: string, status: number, retryAfterSeconds: number) {
  return new Response(message, { status, headers: { 'retry-after': String(retryAfterSeconds) } })
}
