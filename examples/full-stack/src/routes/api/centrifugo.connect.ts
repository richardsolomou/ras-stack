import { createFileRoute } from '@tanstack/react-router'
import crypto from 'node:crypto'
import { requireTanStackMutationOrigin } from 'ras-stack/tanstack/server'
import { currentUser } from '../../server/session'

export const Route = createFileRoute('/api/centrifugo/connect')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!proxySecret(request)) return Response.json({ disconnect: { code: 4501, reason: 'unauthorized' } })
        try {
          requireTanStackMutationOrigin({ configured: [process.env.APP_URL], trustForwardedHeaders: true }, request)
        } catch {
          return Response.json({ disconnect: { code: 4501, reason: 'unauthorized' } })
        }
        const user = await currentUser(request)
        return user
          ? Response.json({ result: { user: user.id, info: { name: user.name } } })
          : Response.json({ disconnect: { code: 4501, reason: 'unauthorized' } })
      },
    },
  },
})

function proxySecret(request: Request) {
  const expected = Buffer.from(process.env.CENTRIFUGO_PROXY_SECRET ?? '')
  const received = Buffer.from(request.headers.get('x-proxy-secret') ?? '')
  return expected.length > 0 && expected.length === received.length && crypto.timingSafeEqual(expected, received)
}
