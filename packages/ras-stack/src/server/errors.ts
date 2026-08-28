export type InfrastructureFailure = {
  code: string
  message: string
  retryable: boolean
}

export class InfrastructureError extends Error {
  readonly code: string
  readonly publicMessage: string
  readonly retryable: boolean

  constructor(code: string, publicMessage: string, options: { cause?: unknown; retryable?: boolean } = {}) {
    super(publicMessage, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'InfrastructureError'
    this.code = code
    this.publicMessage = publicMessage
    this.retryable = options.retryable ?? false
  }
}

export function infrastructureFailure(error: unknown, fallback: InfrastructureFailure): InfrastructureFailure {
  const known = findCause(error, (candidate): candidate is InfrastructureError => candidate instanceof InfrastructureError)
  return known ? { code: known.code, message: known.publicMessage, retryable: known.retryable } : fallback
}

export function safeInfrastructureError(error: unknown, fallback: InfrastructureFailure) {
  const failure = infrastructureFailure(error, fallback)
  return new InfrastructureError(failure.code, failure.message, { cause: error, retryable: failure.retryable })
}

export function infrastructureDiagnostic(error: unknown) {
  const found = findCause(error, (candidate): candidate is Error => candidate instanceof Error)
  if (!found) return { name: 'UnknownError', message: String(error) }
  const code = findProperty(error, 'code', (value): value is string | number => typeof value === 'string' || typeof value === 'number')
  const status = findProperty(error, 'status', (value): value is number => typeof value === 'number')
  return {
    name: found.name,
    message: found.message,
    ...(code === undefined ? {} : { code }),
    ...(status === undefined ? {} : { status }),
  }
}

export function errorHasCode(error: unknown, code: string | number) {
  return findProperty(error, 'code', (value): value is string | number => typeof value === 'string' || typeof value === 'number') === code
}

function findCause<T>(error: unknown, matches: (candidate: unknown) => candidate is T): T | undefined {
  let current = error
  const seen = new Set<unknown>()
  while (current && !seen.has(current)) {
    if (matches(current)) return current
    seen.add(current)
    current = typeof current === 'object' && 'cause' in current ? current.cause : undefined
  }
  return undefined
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
