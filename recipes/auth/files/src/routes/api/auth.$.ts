import { createFileRoute } from '@tanstack/react-router'
import { app } from '../../server/app'

const handle = ({ request }: { request: Request }) => app().auth.handler(request)

/** Better Auth owns every path under `/api/auth`: sign-up, sign-in, sign-out, sessions, OAuth callbacks, and password reset. */
export const Route = createFileRoute('/api/auth/$')({
  server: { handlers: { GET: handle, POST: handle } },
})
