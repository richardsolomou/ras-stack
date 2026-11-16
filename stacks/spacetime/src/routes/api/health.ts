import { createFileRoute } from '@tanstack/react-router'
import { sql } from 'drizzle-orm'
import { spacetimeSettings } from '../../client/spacetime'
import { app } from '../../server/app'
import { healthResponse } from '../../server/health'

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: () =>
        healthResponse(async () => {
          spacetimeSettings()
          await (await app().database).get(sql`SELECT 1`)
        }),
    },
  },
})
