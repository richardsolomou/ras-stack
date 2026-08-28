import { createFileRoute } from '@tanstack/react-router'
import { requireTanStackMutationOrigin } from 'ras-stack/tanstack/server'
import { app } from '../../server/app'
import { limitAuthenticatedRequest } from '../../server/rate-limit'
import { requireCurrentUser } from '../../server/session'

export const Route = createFileRoute('/api/uploads/$id')({
  server: {
    handlers: {
      HEAD: async ({ request, params }) => {
        const user = await requireCurrentUser(request)
        const upload = app().uploadStore.getOwned(params.id, user.id)
        return upload ? new Response(null, { headers: headers(upload.offset, upload.length) }) : new Response(null, { status: 404 })
      },
      PATCH: async ({ request, params }) => {
        requireTanStackMutationOrigin(
          { configured: [app().environment.appUrl], trustForwardedHeaders: app().environment.trustProxy },
          request,
        )
        const user = await requireCurrentUser(request)
        await limitAuthenticatedRequest(request, 'upload-chunk', user.id, { window: 60, max: 120 })
        const declaredLength = Number(request.headers.get('content-length'))
        if (!Number.isSafeInteger(declaredLength) || declaredLength < 1 || declaredLength > app().environment.uploadMaxBytes) {
          return new Response('Invalid content length', { status: 400 })
        }
        const chunk = new Uint8Array(await request.arrayBuffer())
        if (chunk.length !== declaredLength) return new Response('Content length mismatch', { status: 400 })
        const upload = await app().uploadStore.append(params.id, user.id, Number(request.headers.get('upload-offset')), chunk)
        return new Response(null, { status: 204, headers: headers(upload.offset, upload.length) })
      },
    },
  },
})

const headers = (offset: number, length: number) => ({
  'Cache-Control': 'no-store',
  'Tus-Resumable': '1.0.0',
  'Upload-Length': String(length),
  'Upload-Offset': String(offset),
})
