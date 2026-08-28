import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { desc } from 'drizzle-orm'
import { z } from 'zod'
import { app } from './app'
import { writeMessage } from './messages'
import { messages } from './schema'
import { currentUser } from './session'
import { mutationRpc, rpc } from './rpc'
import { limitAuthenticatedRequest } from './rate-limit'

export const snapshot = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => ({
    user: await currentUser(),
    messages: app().database.select().from(messages).orderBy(desc(messages.id)).limit(50).all(),
    emailConfigured: Boolean(app().email),
    realtimeEnabled: app().environment.realtimeEnabled,
  })),
)

export const addMessage = createServerFn({ method: 'POST' })
  .validator(z.object({ body: z.string().trim().min(1).max(280) }))
  .handler(({ data }) =>
    mutationRpc(async () => {
      const request = getRequest()
      const user = await currentUser(request)
      if (!user) throw new Response('Sign in first', { status: 401 })
      await limitAuthenticatedRequest(request, 'messages', user.id, { window: 60, max: 30 })
      const now = new Date()
      const application = app()
      return writeMessage(application.database, application.environment.realtimeEnabled, {
        authorId: user.id,
        author: user.name,
        body: data.body,
        createdAt: now,
      })
    }),
  )
