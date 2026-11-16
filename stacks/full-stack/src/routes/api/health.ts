import { createFileRoute } from '@tanstack/react-router'
import { sql } from 'drizzle-orm'
import { app } from '../../server/app'
import { healthResponse } from '../../server/health'

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: () =>
        healthResponse(() => {
          app().database.get(sql`SELECT 1`)
        }),
    },
  },
})
