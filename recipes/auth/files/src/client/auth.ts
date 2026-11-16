import { createAuthClient } from 'better-auth/react'

/** Same origin as the page, so it needs no base URL. */
export const authClient = createAuthClient()
