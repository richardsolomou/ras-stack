import { createFileRoute } from '@tanstack/react-router'
import { requireTanStackMutationOrigin } from 'ras-stack/tanstack/server'
import { requireCurrentUser } from '../../server/session'
import { uploads } from '../../server/uploads'

export const Route = createFileRoute('/api/uploads/$id')({
  server: {
    handlers: {
      HEAD: ({ request, params }) => {
        requireCurrentUser(request)
        const upload = uploads().get(params.id)
        return upload ? new Response(null, { headers: headers(upload.bytes.length, upload.length) }) : new Response(null, { status: 404 })
      },
      PATCH: async ({ request, params }) => {
        requireTanStackMutationOrigin({ configured: [process.env.APP_URL], trustForwardedHeaders: true }, request)
        requireCurrentUser(request)
        const upload = uploads().get(params.id)
        if (!upload) return new Response(null, { status: 404 })
        if (Number(request.headers.get('upload-offset')) !== upload.bytes.length) return new Response(null, { status: 409 })
        const chunk = new Uint8Array(await request.arrayBuffer())
        if (upload.bytes.length + chunk.length > upload.length) return new Response(null, { status: 413 })
        const bytes = new Uint8Array(upload.bytes.length + chunk.length)
        bytes.set(upload.bytes)
        bytes.set(chunk, upload.bytes.length)
        upload.bytes = bytes
        if (upload.bytes.length === upload.length) uploads().delete(params.id)
        return new Response(null, { status: 204, headers: headers(upload.bytes.length, upload.length) })
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
