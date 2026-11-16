import { type ReactNode, useState } from 'react'
import { setGlobalLogLevel } from 'spacetimedb'
import { SpacetimeDBProvider } from 'spacetimedb/react'
import { DbConnection } from '../spacetime/generated'

const tokenKey = 'spacetime:token'

type TokenStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** `localStorage` in the browser; nothing during server rendering or where storage is blocked, so the visitor connects anonymously. */
function browserStorage(): TokenStore | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

/**
 * The connection to the application's database. A visitor keeps the anonymous identity SpacetimeDB issued on their first
 * visit by presenting its stored token. A token the server no longer accepts is dropped and the page reloads to connect as
 * a new identity, because the provider's own retries would present the rejected token forever.
 */
export function spacetimeConnection(
  uri: string | undefined = import.meta.env.VITE_SPACETIME_URL,
  database: string | undefined = import.meta.env.VITE_SPACETIME_DATABASE,
  storage = browserStorage(),
  reload = () => window.location.reload(),
) {
  if (!uri || !database) throw new Error('VITE_SPACETIME_URL and VITE_SPACETIME_DATABASE must be set')
  // The SDK logs every connect at info through console.log, which browser console capture would record as noise.
  setGlobalLogLevel('warn')
  return DbConnection.builder()
    .withUri(uri)
    .withDatabaseName(database)
    .withToken(storage?.getItem(tokenKey) ?? undefined)
    .onConnect((_connection, _identity, token) => storage?.setItem(tokenKey, token))
    .onConnectError((_context, error) => {
      if (!rejectedToken(error) || !storage?.getItem(tokenKey)) return
      storage.removeItem(tokenKey)
      reload()
    })
}

function rejectedToken(error: Error) {
  return error.name === 'WebSocketTokenError' && 'status' in error && (error.status === 401 || error.status === 403)
}

/**
 * Shares one connection with every `useTable`, `useReducer`, and `useSpacetimeDB` below it. The SDK reconnects with
 * jittered backoff after a drop, replays subscriptions, and rebuilds the connection when a first attempt fails.
 */
export function SpacetimeProvider({ children }: { children: ReactNode }) {
  const [connectionBuilder] = useState(() => spacetimeConnection())
  return <SpacetimeDBProvider connectionBuilder={connectionBuilder}>{children}</SpacetimeDBProvider>
}
