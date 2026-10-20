import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { errorHasCode } from '../server/errors.js'
import { randomToken } from './random.js'

export type PersistedSecretOptions = {
  directory: string
  environment?: NodeJS.ProcessEnv
  environmentKey?: string
  filename?: string
  bytes?: number
}

export function persistedSecret(options: PersistedSecretOptions) {
  const environment = options.environment ?? process.env
  const configured = environment[options.environmentKey ?? 'AUTH_SECRET']?.trim()
  if (configured) return configured

  const file = path.join(options.directory, options.filename ?? 'auth.secret')
  try {
    return readSecret(file)
  } catch (error) {
    if (!errorHasCode(error, 'ENOENT')) throw error
  }

  fs.mkdirSync(options.directory, { recursive: true })
  const secret = randomToken(options.bytes ?? 32)
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`
  try {
    fs.writeFileSync(temporary, secret, { mode: 0o600, flag: 'wx' })
    try {
      fs.linkSync(temporary, file)
      return secret
    } catch (error) {
      if (!errorHasCode(error, 'EEXIST')) throw error
      return readSecret(file)
    }
  } finally {
    fs.rmSync(temporary, { force: true })
  }
}

function readSecret(file: string) {
  const secret = fs.readFileSync(file, 'utf8').trim()
  if (!secret) throw new Error(`Secret file is empty: ${file}`)
  return secret
}
