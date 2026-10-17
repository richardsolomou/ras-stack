export function errorHasCode(error: unknown, code: string | number) {
  return findProperty(error, 'code', (value): value is string | number => typeof value === 'string' || typeof value === 'number') === code
}

function findProperty<T>(error: unknown, property: string, matches: (value: unknown) => value is T): T | undefined {
  let current = error
  const seen = new Set<unknown>()
  while (current && !seen.has(current)) {
    seen.add(current)
    if (typeof current !== 'object') return undefined
    if (property in current) {
      const value = current[property as keyof typeof current]
      if (matches(value)) return value
    }
    current = 'cause' in current ? current.cause : undefined
  }
  return undefined
}
