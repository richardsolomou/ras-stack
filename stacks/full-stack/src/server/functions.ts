import { createServerFn } from '@tanstack/react-start'
import { app } from './app'
import { SOCIAL_PROVIDERS, socialProviders } from './auth'
import { mutationRpc, rpc } from './rpc'
import { currentUser, requireUser } from './session'

export const readViewer = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const user = await currentUser()
    return user && { id: user.id, name: user.name, email: user.email }
  }),
)

/** The sign-in page offers only the providers this deployment has credentials for. */
export const readSignInOptions = createServerFn({ method: 'GET' }).handler(() =>
  rpc(() => {
    const configured = socialProviders()
    return { providers: SOCIAL_PROVIDERS.filter((provider) => configured[provider]) }
  }),
)

/** Tells everyone following `updates:demo` what the signed-in user said. */
export const announce = createServerFn({ method: 'POST' })
  .validator((text: unknown) => String(text).slice(0, 200))
  .handler(({ data }) =>
    mutationRpc(async () => {
      const user = await requireUser()
      app().realtime.publish('updates:demo', { text: `${user.name}: ${data}`, at: Date.now() })
    }),
  )
