import { sqliteRateLimitStore } from 'ras-stack/database/sqlite'
import { createRateLimit } from 'ras-stack/server'
import type { RateLimitRule } from 'ras-stack/auth'
import { app } from './app'

const limiters = new WeakMap<object, Map<string, ReturnType<typeof createRateLimit>>>()
const identities = new WeakMap<Request, string>()

export function limitAuthenticatedRequest(request: Request, scope: string, userId: string, rule: RateLimitRule) {
  const database = app().database
  let databaseLimiters = limiters.get(database)
  if (!databaseLimiters) {
    databaseLimiters = new Map()
    limiters.set(database, databaseLimiters)
  }
  let limiter = databaseLimiters.get(scope)
  if (!limiter) {
    limiter = createRateLimit({
      store: sqliteRateLimitStore(database.$client, 'app_rate_limit'),
      rule,
      scope,
      identify: (candidate) => identities.get(candidate),
      onUnavailable: 'reject',
    })
    databaseLimiters.set(scope, limiter)
  }
  identities.set(request, userId)
  return limiter(request).finally(() => identities.delete(request))
}
