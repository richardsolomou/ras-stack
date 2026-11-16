import { createFileRoute } from '@tanstack/react-router'
import { app } from '../../server/app'
import { healthResponse } from '../../server/health'

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      // Liveness, not readiness: the image's health check restarts a failing container, which cannot bring back a database
      // that is down. Awaiting the database proves only that it connected and migrated when the process started.
      GET: () =>
        healthResponse(async () => {
          await app().database
        }),
    },
  },
})
