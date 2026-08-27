import { createTanStackRpc, requireTanStackMutationOrigin } from 'ras-stack/tanstack/server'
import { createPostHogRpcLogger } from 'ras-stack/posthog/server'
import { app } from './app'
import { currentUser } from './session'

const reportRpcError = createPostHogRpcLogger(app().telemetry, {
  logError: (error, context) => console.error({ event: 'example_server_function_failed', ...context, error }),
  resolveAuthenticatedDistinctId: async (request) => (await currentUser(request))?.id,
  allowAnonymousDistinctId: true,
})

export const { rpc, mutationRpc } = createTanStackRpc({
  requireMutation: (request) =>
    requireTanStackMutationOrigin({ configured: [app().environment.appUrl], trustForwardedHeaders: app().environment.trustProxy }, request),
  logError: reportRpcError,
})
