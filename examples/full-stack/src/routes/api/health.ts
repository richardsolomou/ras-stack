import { createFileRoute } from '@tanstack/react-router'
import { readinessHandler } from './ready'

export const Route = createFileRoute('/api/health')({
  server: { handlers: { GET: readinessHandler } },
})
