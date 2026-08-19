import { createFileRoute } from '@tanstack/react-router'
import { requireTanStackMutationOrigin } from 'ras-stack/tanstack/server'
import { app } from '../../server/app'
import { limitAuthenticatedRequest } from '../../server/rate-limit'
import { requireCurrentUser } from '../../server/session'

export const Route = createFileRoute('/api/uploads')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        requireTanStackMutationOrigin(
          { configured: [app().environment.appUrl], trustForwardedHeaders: app().environment.trustProxy },
          request,
        )
        const user = await requireCurrentUser(request)
        await limitAuthenticatedRequest(request, 'upload-create', user.id, { window: 60, max: 10 })
        const id = app().uploadStore.create(user.id, Number(request.headers.get('upload-length')), request.headers.get('upload-metadata'))
        return new Response(null, {
          status: 201,
          headers: { Location: `/api/uploads/${id}`, 'Tus-Resumable': '1.0.0', 'Cache-Control': 'no-store' },
        })
      },
    },
  },
})
