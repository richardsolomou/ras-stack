import { createTanStackRpc, requireTanStackMutationOrigin } from 'ras-stack/tanstack/server'
import { createPostHogRpcLogger } from 'ras-stack/posthog/server'
import { app } from './app'
import { currentUser } from './session'

const reportRpcError = createPostHogRpcLogger(app().telemetry, {
  logError: (error, context) => console.error({ event: 'example_server_function_failed', ...context, error }),
  resolveAuthenticatedDistinctId: (request) => currentUser(request)?.id,
  allowAnonymousDistinctId: true,
})

export const { rpc, mutationRpc } = createTanStackRpc({
  requireMutation: (request) => requireTanStackMutationOrigin({ configured: [process.env.APP_URL], trustForwardedHeaders: true }, request),
  logError: reportRpcError,
})
