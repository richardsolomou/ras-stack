import { createServerFn } from '@tanstack/react-start'
import { setCookie } from '@tanstack/react-start/server'
import { desc } from 'drizzle-orm'
import { z } from 'zod'
import { app } from './app'
import { messages } from './schema'
import { currentUser, sessionCookie } from './session'
import { mutationRpc, rpc } from './rpc'

export const snapshot = createServerFn({ method: 'GET' }).handler(() =>
  rpc(() => ({
    user: currentUser(),
    messages: app().database.select().from(messages).orderBy(desc(messages.id)).limit(50).all(),
    emailConfigured: app().emailConfigured,
  })),
)

export const signIn = createServerFn({ method: 'POST' })
  .validator(z.object({ name: z.string().trim().min(2).max(40) }))
  .handler(({ data }) =>
    mutationRpc(() => {
      const session = sessionCookie(data.name)
      setCookie(session.name, session.value, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 3600 })
      return { name: data.name }
    }),
  )

export const addMessage = createServerFn({ method: 'POST' })
  .validator(z.object({ body: z.string().trim().min(1).max(280) }))
  .handler(({ data }) =>
    mutationRpc(() => {
      const user = currentUser()
      if (!user) throw new Response('Sign in first', { status: 401 })
      const [message] = app()
        .database.insert(messages)
        .values({ author: user.name, body: data.body, createdAt: new Date() })
        .returning()
        .all()
      app().publisher.publish('messages:all', { type: 'message-added', id: message!.id })
      return message!
    }),
  )
