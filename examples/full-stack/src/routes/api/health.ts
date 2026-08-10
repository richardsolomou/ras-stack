import { createFileRoute } from '@tanstack/react-router'
import { sql } from 'drizzle-orm'
import { databaseHealthFailure } from 'ras-stack/server'
import { tanStackHealthHandler } from 'ras-stack/tanstack/server'
import { app } from '../../server/app'

export const Route = createFileRoute('/api/health')({
  server: { handlers: { GET: tanStackHealthHandler(() => app().database.get(sql`SELECT 1`), { failure: databaseHealthFailure }) } },
})
