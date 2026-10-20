import { createFileRoute } from '@tanstack/react-router'
import { app } from '../../server/app'
import { requireCurrentUser, requireMutationOrigin } from '../../server/session'

export const Route = createFileRoute('/api/uploads')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        requireMutationOrigin(request)
        const user = await requireCurrentUser(request)
        const id = app().uploadStore.create(user.id, Number(request.headers.get('upload-length')), request.headers.get('upload-metadata'))
        return new Response(null, {
          status: 201,
          headers: { Location: `/api/uploads/${id}`, 'Tus-Resumable': '1.0.0', 'Cache-Control': 'no-store' },
        })
      },
    },
  },
})
