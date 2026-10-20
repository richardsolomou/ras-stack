import { createTanStackRpc } from 'ras-stack/tanstack/server'
import { createPostHogRpcLogger } from 'ras-stack/posthog/server'
import { app } from './app'
import { currentUser, requireMutationOrigin } from './session'

const reportRpcError = createPostHogRpcLogger(app().telemetry, {
  logError: (error, context) => console.error({ event: 'example_server_function_failed', ...context, error }),
  resolveAuthenticatedDistinctId: async (request) => (await currentUser(request))?.id,
  allowAnonymousDistinctId: true,
})

export const { rpc, mutationRpc } = createTanStackRpc({
  requireMutation: requireMutationOrigin,
  logError: reportRpcError,
})
