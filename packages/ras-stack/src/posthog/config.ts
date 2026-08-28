export type PostHogEnvironment = {
  projectToken: string
  host: string
  uiHost: string
  assetsHost: string
}

export function postHogEnvironment(input: { projectToken?: string; host?: string; assetsHost?: string }): PostHogEnvironment | undefined {
  const projectToken = input.projectToken?.trim()
  const host = input.host?.trim()
  if (!projectToken && !host && !input.assetsHost) return undefined
  if (!projectToken) throw new Error('PostHog projectToken is required when a host is configured')
  const parsed = httpUrl(host || 'https://us.i.posthog.com', 'PostHog host')
  return {
    projectToken,
    host: normalizedUrl(parsed),
    uiHost: postHogUiHost(parsed),
    assetsHost: input.assetsHost ? postHogHttpUrl(input.assetsHost, 'PostHog assetsHost') : postHogAssetsHost(parsed),
  }
}

export function postHogHttpUrl(value: string, name: string) {
  return normalizedUrl(httpUrl(value, name))
}

function httpUrl(value: string, name: string) {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`${name} must be an HTTP URL without credentials, query, or fragment`)
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(`${name} must be an HTTP URL without credentials, query, or fragment`)
  }
  return parsed
}

function normalizedUrl(url: URL) {
  return url.toString().replace(/\/$/, '')
}

function postHogUiHost(host: URL) {
  if (host.hostname === 'us.i.posthog.com') return 'https://us.posthog.com'
  if (host.hostname === 'eu.i.posthog.com') return 'https://eu.posthog.com'
  return host.origin
}

function postHogAssetsHost(host: URL) {
  if (host.hostname === 'us.i.posthog.com') return 'https://us-assets.i.posthog.com'
  if (host.hostname === 'eu.i.posthog.com') return 'https://eu-assets.i.posthog.com'
  return normalizedUrl(host)
}
