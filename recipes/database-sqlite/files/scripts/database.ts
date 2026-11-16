import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { databaseFile } from './databaseFile.ts'

type FileOperations = { copyFile: typeof copyFile; mkdir: typeof mkdir; rename: typeof rename; rm: typeof rm }
const defaultFileOperations: FileOperations = { copyFile, mkdir, rename, rm }

export async function runDatabaseCommand(
  command: 'backup' | 'restore',
  suppliedPath: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  fileOperations: FileOperations = defaultFileOperations,
) {
  const source = databaseFile(env)
  const dataDirectory = path.dirname(source)
  if (command === 'backup') {
    const backupDirectory = path.join(dataDirectory, 'backups')
    await fileOperations.mkdir(backupDirectory, { recursive: true })
    const destination = suppliedPath
      ? path.resolve(suppliedPath)
      : path.join(backupDirectory, `app-${new Date().toISOString().replaceAll(':', '-')}.sqlite`)
    // Read-write, so closing the last connection checkpoints a WAL database and removes its sidecars, which restore refuses.
    const database = new Database(source, { fileMustExist: true })
    try {
      integrity(database, 'source')
      await database.backup(destination)
      const copy = new Database(destination, { fileMustExist: true })
      try {
        // The copy inherits WAL mode; switching back makes it one self-contained file with no sidecars to lose.
        copy.pragma('journal_mode = DELETE')
        integrity(copy, 'backup')
      } finally {
        copy.close()
      }
      return destination
    } finally {
      database.close()
    }
  }

  if (!suppliedPath) throw new Error('restore requires a backup file')
  const candidate = path.resolve(suppliedPath)
  const backup = new Database(candidate, { readonly: true, fileMustExist: true })
  try {
    integrity(backup, 'backup')
  } finally {
    backup.close()
  }
  await fileOperations.mkdir(dataDirectory, { recursive: true })
  // A clean shutdown checkpoints and removes the sidecars, so either one means the application is running or crashed mid-write.
  for (const sidecar of [`${source}-wal`, `${source}-shm`]) {
    if (existsSync(sidecar)) throw new Error(`Refusing to restore while SQLite sidecar exists: ${sidecar}`)
  }
  // Copied and checked on the destination filesystem first, so the final rename is atomic.
  const temporary = `${source}.restore-${process.pid}`
  await fileOperations.copyFile(candidate, temporary)
  const restored = new Database(temporary, { readonly: true, fileMustExist: true })
  try {
    integrity(restored, 'restored')
  } finally {
    restored.close()
  }
  const previous = `${source}.before-restore-${Date.now()}`
  const hasPrevious = existsSync(source)
  if (hasPrevious) await fileOperations.rename(source, previous)
  try {
    await fileOperations.rename(temporary, source)
  } catch (error) {
    const failures = [error]
    if (hasPrevious) {
      try {
        await fileOperations.rename(previous, source)
      } catch (rollbackError) {
        failures.push(rollbackError)
      }
    }
    try {
      await fileOperations.rm(temporary, { force: true })
    } catch (cleanupError) {
      failures.push(cleanupError)
    }
    if (failures.length === 1) throw error
    const failure = new AggregateError(failures, 'Restore replacement failed and recovery was incomplete')
    failure.cause = error
    throw failure
  }
  return source
}

function integrity(database: Database.Database, label: string) {
  const result = database.pragma('quick_check', { simple: true })
  if (result !== 'ok') throw new Error(`${label} database failed quick_check: ${String(result)}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, suppliedPath] = process.argv.slice(2)
  if (command !== 'backup' && command !== 'restore') {
    console.error('usage: database.ts <backup [destination]|restore backup-file>')
    process.exitCode = 2
  } else {
    try {
      console.log(await runDatabaseCommand(command, suppliedPath))
    } catch (error) {
      console.error(error)
      process.exitCode = 1
    }
  }
}
