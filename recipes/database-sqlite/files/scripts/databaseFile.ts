import path from 'node:path'

/** The database's file name in `DATA_DIR`. An existing application sets the name its deployments already have. */
export const databaseFileName = 'app.sqlite'

/**
 * `$DATA_DIR/<databaseFileName>`; `DATA_DIR` is required in production so data never lands in the container's own filesystem.
 * It lives in `scripts/` because the production image runs `scripts/database.ts` alone, beside this file.
 */
export function databaseFile(env: NodeJS.ProcessEnv = process.env) {
  if (!env.DATA_DIR && env.NODE_ENV === 'production') throw new Error('DATA_DIR is required in production')
  return path.join(path.resolve(env.DATA_DIR ?? '.data'), databaseFileName)
}
