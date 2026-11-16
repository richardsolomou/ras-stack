import { createFileRoute } from '@tanstack/react-router'
import { app } from '../../server/app'

// No GET: serving stored files from this origin is the application's decision, made in its own route after checking access.
const handle = ({ request }: { request: Request }) => app().uploads.handle(request)

export const Route = createFileRoute('/api/uploads/$')({
  server: { handlers: { POST: handle, HEAD: handle, PATCH: handle, DELETE: handle } },
})
