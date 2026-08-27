import { getRequest } from '@tanstack/react-start/server'
import { app } from './app'

export async function currentUser(request = getRequest()) {
  const session = await app().auth.api.getSession({ headers: request.headers })
  return session?.user
}

export async function requireCurrentUser(request: Request) {
  const user = await currentUser(request)
  if (!user) throw new Response('Sign in first', { status: 401 })
  return user
}
