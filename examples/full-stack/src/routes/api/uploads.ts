import { createFileRoute } from '@tanstack/react-router'
import { requireTanStackMutationOrigin } from 'ras-stack/tanstack/server'
import { requireCurrentUser } from '../../server/session'
import { createUpload } from '../../server/uploads'

export const Route = createFileRoute('/api/uploads')({
  server: {
    handlers: {
      POST: ({ request }) => {
        requireTanStackMutationOrigin({ configured: [process.env.APP_URL], trustForwardedHeaders: true }, request)
        requireCurrentUser(request)
        const id = createUpload(Number(request.headers.get('upload-length')))
        return new Response(null, { status: 201, headers: { Location: `/api/uploads/${id}`, 'Tus-Resumable': '1.0.0' } })
      },
    },
  },
})
