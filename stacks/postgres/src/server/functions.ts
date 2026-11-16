import { createServerFn } from '@tanstack/react-start'
import { SOCIAL_PROVIDERS, socialProviders } from './auth'
import { rpc } from './rpc'
import { currentUser } from './session'

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
