import fs from 'node:fs'

export type RealtimeEnvironmentOptions = {
  prefix?: string
  developmentSecret?: string
}

export type RealtimeEnvironment = { apiUrl: string; apiKey: string; secret: string }

export function realtimeEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
  options: RealtimeEnvironmentOptions = {},
): RealtimeEnvironment | undefined {
  const value = (name: string) => environment[`${options.prefix ?? ''}REALTIME_${name}`]?.trim() || undefined
  const secret =
    value('SECRET') ??
    secretFromFile(value('SECRET_FILE')) ??
    (environment.NODE_ENV === 'production' ? undefined : options.developmentSecret)
  if (!secret) return undefined
  return {
    apiUrl: (value('API_URL') ?? 'http://127.0.0.1:8000/api').replace(/\/$/, ''),
    apiKey: value('API_KEY') ?? secret,
    secret,
  }
}

function secretFromFile(file: string | undefined) {
  if (!file) return undefined
  try {
    return fs.readFileSync(file, 'utf8').trim() || undefined
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}
