export type CanonicalRedirectOptions = {
  canonicalUrl?: string
  pathsServedOnAnyHost?: ReadonlySet<string>
}

export function canonicalRedirect(requestUrl: string, options: CanonicalRedirectOptions) {
  if (!options.canonicalUrl?.trim()) return null
  try {
    const canonical = new URL(options.canonicalUrl)
    const incoming = new URL(requestUrl)
    if (incoming.host === canonical.host || options.pathsServedOnAnyHost?.has(incoming.pathname)) return null
    // A sibling process calling over the loopback interface is not a visitor who typed the wrong hostname.
    // Redirecting it sends an internal request out to the public name, and its client may not follow the
    // redirect, may drop the method, or may not be able to reach that name at all.
    if (loopback(incoming.hostname)) return null
    return new URL(incoming.pathname + incoming.search + incoming.hash, canonical.origin).toString()
  } catch {
    return null
  }
}

function loopback(hostname: string) {
  return hostname === 'localhost' || hostname === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(hostname)
}
