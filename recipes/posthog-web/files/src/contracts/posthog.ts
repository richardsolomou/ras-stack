/** Names this application's PostHog logs, metrics, and spans; the browser reports as `<name>-web` and the server as `<name>-server`. */
export const serviceName = 'app'

/** Where the browser sends PostHog requests on this origin. Ad-blocker lists match the literal `/ingest` segment on any host. */
export const ingestPath = '/t'

export type PostHogEnvironment = { projectToken: string; host: string; uiHost: string; assetsHost: string }

/**
 * PostHog's project and hosts; undefined with neither set, which keeps PostHog off. US Cloud is the default host. A host
 * without a token throws, since it means analytics were meant to be on and a missing token would turn them off silently.
 */
export function postHogEnvironment(input: {
  projectToken?: string | undefined
  host?: string | undefined
}): PostHogEnvironment | undefined {
  const projectToken = input.projectToken?.trim()
  const configuredHost = input.host?.trim()
  if (!projectToken) {
    if (configuredHost) throw new Error('VITE_POSTHOG_PROJECT_TOKEN is required when VITE_POSTHOG_HOST is set')
    return undefined
  }
  const host = httpUrl(configuredHost || 'https://us.i.posthog.com')
  return { projectToken, host: host.toString().replace(/\/$/, ''), uiHost: uiHost(host), assetsHost: assetsHost(host) }
}

/** The project this build's browser bundle reports to, fixed when Vite builds it; the ingest proxy forwards to the same hosts. */
export const bundledPostHog = postHogEnvironment({
  projectToken: import.meta.env.VITE_POSTHOG_PROJECT_TOKEN,
  host: import.meta.env.VITE_POSTHOG_HOST,
})

function httpUrl(value: string) {
  const url = URL.parse(value)
  if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('VITE_POSTHOG_HOST must be an HTTP URL without credentials, query, or fragment')
  }
  return url
}

function uiHost(host: URL) {
  if (host.hostname === 'us.i.posthog.com') return 'https://us.posthog.com'
  if (host.hostname === 'eu.i.posthog.com') return 'https://eu.posthog.com'
  return host.origin
}

function assetsHost(host: URL) {
  if (host.hostname === 'us.i.posthog.com') return 'https://us-assets.i.posthog.com'
  if (host.hostname === 'eu.i.posthog.com') return 'https://eu-assets.i.posthog.com'
  return host.toString().replace(/\/$/, '')
}
