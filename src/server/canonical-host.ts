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
    return new URL(incoming.pathname + incoming.search + incoming.hash, canonical.origin).toString()
  } catch {
    return null
  }
}
