const base = 'https://local.invalid'

/** `value` when it is a path on this site, such as a `?next=` destination after sign-in; undefined for anything that leaves it. */
export function localRedirectPath(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('/')) return undefined
  try {
    const resolved = new URL(value, base)
    if (resolved.origin !== base) return undefined
    const destination = `${resolved.pathname}${resolved.search}${resolved.hash}`
    // Dot segments can normalize into `//host`, which is local as written but leaves the site once navigated to.
    if (new URL(destination, base).origin !== base) return undefined
    return destination
  } catch {
    return undefined
  }
}
