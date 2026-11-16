import { getRequest } from '@tanstack/react-start/server'
import { app } from './app'
import type { Auth } from './auth'

// From `Auth` rather than `app()`, so the composition root can use these helpers without its type depending on itself.
type Session = Awaited<ReturnType<Auth['api']['getSession']>>
export type User = NonNullable<Session>['user']

// Every read on a server-rendered page asks who is signed in, and the answer cannot change within one request.
const sessions = new WeakMap<Request, Promise<Session>>()

/** The signed-in session for this request, or null; looked up once per request. */
export function currentSession(request = getRequest()): Promise<Session> {
  const known = sessions.get(request)
  if (known) return known
  const lookup = app()
    .auth.api.getSession({ headers: request.headers })
    .catch((error: unknown) => {
      // A failed lookup must not stand as the answer for the rest of the request.
      sessions.delete(request)
      throw error
    })
  sessions.set(request, lookup)
  return lookup
}

export async function currentUser(request = getRequest()): Promise<User | null> {
  return (await currentSession(request))?.user ?? null
}

/** The signed-in user; inside `rpc` a signed-out caller gets a 401 with this message. */
export async function requireUser(request = getRequest()): Promise<User> {
  const user = await currentUser(request)
  if (!user) throw new Response('Sign in to continue.', { status: 401 })
  return user
}
