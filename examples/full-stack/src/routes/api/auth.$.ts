import { createFileRoute } from '@tanstack/react-router'
import { app } from '../../server/app'

const handler = ({ request }: { request: Request }) => app().auth.handler(request)

export const Route = createFileRoute('/api/auth/$')({
  server: { handlers: { GET: handler, POST: handler } },
})
