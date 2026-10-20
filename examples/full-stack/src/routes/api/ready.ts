import { createFileRoute } from '@tanstack/react-router'
import { sql } from 'drizzle-orm'
import { tanStackHealthHandler } from 'ras-stack/tanstack/server'
import { app } from '../../server/app'
import { outboxStatus } from '../../server/outbox'

export const readinessHandler = tanStackHealthHandler(
  async () => {
    app().database.get(sql`SELECT 1`)
    const status = outboxStatus(app().database)
    if (status.failed > 0) throw new Error(`Realtime outbox has ${status.failed} dead-lettered item(s)`)
    await app().email?.verify()
  },
  {
    failure: (error) => {
      console.error({ event: 'example_readiness_failed', error })
      return { code: 'dependency_unavailable', message: 'required dependency unavailable' }
    },
  },
)

export const Route = createFileRoute('/api/ready')({
  server: {
    handlers: { GET: readinessHandler },
  },
})
