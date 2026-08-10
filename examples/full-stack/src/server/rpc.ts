import { createTanStackRpc, requireTanStackMutationOrigin } from 'ras-stack/tanstack/server'

export const { rpc, mutationRpc } = createTanStackRpc({
  requireMutation: (request) => requireTanStackMutationOrigin({ configured: [process.env.APP_URL], trustForwardedHeaders: true }, request),
  logError: (error, context) => console.error({ event: 'example_server_function_failed', ...context, error }),
})
