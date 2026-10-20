import { getRequest } from '@tanstack/react-start/server'
import { requireTanStackMutationOrigin } from 'ras-stack/tanstack/server'
import { app } from './app'

export async function currentUser(request = getRequest()) {
  const session = await app().auth.api.getSession({ headers: request.headers })
  return session?.user
}

export async function requireCurrentUser(request = getRequest()) {
  const user = await currentUser(request)
  if (!user) throw new Response('Sign in first', { status: 401 })
  return user
}

export function requireMutationOrigin(request: Request) {
  const { appUrl, trustProxy } = app().environment
  requireTanStackMutationOrigin({ configured: [appUrl], trustForwardedHeaders: trustProxy }, request)
}
