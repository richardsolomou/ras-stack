import { createFileRoute } from '@tanstack/react-router'
import { app } from '../../server/app'

export const Route = createFileRoute('/api/realtime/token')({
  server: { handlers: { POST: ({ request }) => app().realtime.ticket(request) } },
})
