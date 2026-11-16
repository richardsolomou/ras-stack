import { createStart } from '@tanstack/react-start'
import { canonicalHost, csrf, securityHeadersMiddleware, serverFunctionIdentity, staleServerFunctions } from './server/middleware'

export const startInstance = createStart(() => ({
  requestMiddleware: [canonicalHost, securityHeadersMiddleware, csrf, staleServerFunctions],
  functionMiddleware: [serverFunctionIdentity],
}))
