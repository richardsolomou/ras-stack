export type SqlitePragmas = {
  journalMode?: 'DELETE' | 'TRUNCATE' | 'PERSIST' | 'MEMORY' | 'WAL' | 'OFF'
  synchronous?: 'OFF' | 'NORMAL' | 'FULL' | 'EXTRA'
  busyTimeout?: number
  foreignKeys?: boolean
}

export function resolveSqlitePragmas(pragmas: SqlitePragmas = {}): Required<SqlitePragmas> {
  const busyTimeout = pragmas.busyTimeout ?? 5000
  if (!Number.isInteger(busyTimeout) || busyTimeout < 0) throw new Error('busyTimeout must be a non-negative integer')
  return {
    journalMode: pragmas.journalMode ?? 'WAL',
    synchronous: pragmas.synchronous ?? 'FULL',
    busyTimeout,
    foreignKeys: pragmas.foreignKeys ?? true,
  }
}
