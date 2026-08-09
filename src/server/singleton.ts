const storeKey = Symbol.for('ras-stack.server.singletons')
type SingletonEntry = { kind: 'sync' | 'async'; value: unknown }
type SingletonGlobal = typeof globalThis & { [storeKey]?: Map<string, SingletonEntry> }

function store() {
  const target = globalThis as SingletonGlobal
  return (target[storeKey] ??= new Map())
}

export function globalSingleton<T>(key: string, create: () => T): T {
  const singletons = store()
  const existing = singletons.get(key)
  if (existing) {
    if (existing.kind !== 'sync') throw new Error(`singleton ${key} is asynchronous`)
    return existing.value as T
  }
  const value = create()
  singletons.set(key, { kind: 'sync', value })
  return value
}

export function globalAsyncSingleton<T>(key: string, create: () => T | Promise<T>): Promise<T> {
  const singletons = store()
  const existing = singletons.get(key)
  if (existing) {
    if (existing.kind !== 'async') throw new Error(`singleton ${key} is synchronous`)
    return existing.value as Promise<T>
  }
  const pending = Promise.resolve().then(create)
  const guarded = pending.catch((error: unknown) => {
    if (singletons.get(key)?.value === guarded) singletons.delete(key)
    throw error
  })
  singletons.set(key, { kind: 'async', value: guarded })
  return guarded
}

export function peekGlobalSingleton(key: string): unknown {
  return store().get(key)?.value
}

export async function clearGlobalSingleton<T>(key: string, dispose?: (value: Awaited<T>) => void | Promise<void>) {
  const singletons = store()
  if (!singletons.has(key)) return false
  const value = singletons.get(key)?.value as T
  singletons.delete(key)
  if (dispose) await dispose(await value)
  return true
}
