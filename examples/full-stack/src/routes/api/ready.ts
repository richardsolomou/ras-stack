import { createFileRoute } from '@tanstack/react-router'
import { sql } from 'drizzle-orm'
import { infrastructureFailure } from 'ras-stack/server'
import { tanStackHealthHandler } from 'ras-stack/tanstack/server'
import { app } from '../../server/app'
import { outboxStatus } from '../../server/outbox'

export const readinessHandler = tanStackHealthHandler(
  async () => {
    try {
      app().database.get(sql`SELECT 1`)
      const status = outboxStatus(app().database)
      if (status.failed > 0) throw new Error(`Realtime outbox has ${status.failed} dead-lettered item(s)`)
      await app().email?.verify()
    } catch (error) {
      console.error({ event: 'example_readiness_failed', error })
      throw error
    }
  },
  {
    failure: (error) =>
      infrastructureFailure(error, { code: 'dependency_unavailable', message: 'required dependency unavailable', retryable: true }),
  },
)

export const Route = createFileRoute('/api/ready')({
  server: {
    handlers: { GET: readinessHandler },
  },
})
