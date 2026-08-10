import type { PostHog, PostHogOptions } from 'posthog-node'
import type { PostHogEnvironment } from './config.js'

export async function createPostHogServerClient(
  environment: PostHogEnvironment | undefined,
  options: Omit<PostHogOptions, 'host'> = {},
): Promise<PostHog | undefined> {
  if (!environment) return undefined
  const { PostHog } = await import('posthog-node')
  return new PostHog(environment.projectToken, {
    host: environment.host,
    enableExceptionAutocapture: true,
    ...options,
  })
}

export async function shutdownPostHogServerClient(client: PostHog | undefined, timeoutMs = 10_000) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0) throw new Error('timeoutMs must be a non-negative integer')
  // oxlint-disable-next-line no-underscore-dangle -- posthog-node's async shutdown API is named `_shutdown`.
  await client?._shutdown(timeoutMs)
}
