import path from 'node:path'

export type AppEnvironment = ReturnType<typeof loadEnvironment>

export function loadEnvironment(environment: NodeJS.ProcessEnv = process.env) {
  const production = environment.NODE_ENV === 'production'
  const appUrl = validUrl(environment.APP_URL ?? (production ? '' : 'http://localhost:3100'), 'APP_URL')
  const dataDirectory = path.resolve(environment.DATA_DIR ?? '.data/example-full-stack')
  if (production && !path.isAbsolute(environment.DATA_DIR ?? '')) throw new Error('DATA_DIR must be absolute in production')
  const trustProxy = booleanValue(environment.TRUST_PROXY, 'TRUST_PROXY', false)
  const requireEmailVerification = booleanValue(environment.EMAIL_REQUIRE_VERIFICATION, 'EMAIL_REQUIRE_VERIFICATION', true)
  const centrifugoApiUrl = environment.CENTRIFUGO_API_URL?.trim() ?? ''
  const centrifugoApiKey = environment.CENTRIFUGO_API_KEY?.trim() ?? ''
  if (Boolean(centrifugoApiUrl) !== Boolean(centrifugoApiKey)) {
    throw new Error('CENTRIFUGO_API_URL and CENTRIFUGO_API_KEY must be configured together')
  }
  const realtimeEnabled = Boolean(centrifugoApiUrl)
  if (production && realtimeEnabled && !environment.CENTRIFUGO_PROXY_SECRET?.trim()) {
    throw new Error('CENTRIFUGO_PROXY_SECRET is required when realtime is enabled in production')
  }
  const uploadMaxBytes = positiveInteger(environment.UPLOAD_MAX_BYTES ?? '1000000', 'UPLOAD_MAX_BYTES')
  const uploadQuotaBytes = positiveInteger(environment.UPLOAD_QUOTA_BYTES ?? '5000000', 'UPLOAD_QUOTA_BYTES')
  const uploadGlobalQuotaBytes = positiveInteger(environment.UPLOAD_GLOBAL_QUOTA_BYTES ?? '100000000', 'UPLOAD_GLOBAL_QUOTA_BYTES')
  const uploadGlobalMaxFiles = positiveInteger(environment.UPLOAD_GLOBAL_MAX_FILES ?? '1024', 'UPLOAD_GLOBAL_MAX_FILES')
  if (uploadQuotaBytes < uploadMaxBytes) throw new Error('UPLOAD_QUOTA_BYTES must be at least UPLOAD_MAX_BYTES')
  if (uploadGlobalQuotaBytes < uploadMaxBytes) throw new Error('UPLOAD_GLOBAL_QUOTA_BYTES must be at least UPLOAD_MAX_BYTES')
  return {
    appUrl,
    centrifugoApiKey,
    centrifugoApiUrl,
    dataDirectory,
    production,
    realtimeEnabled,
    requireEmailVerification,
    trustProxy,
    uploadGlobalMaxFiles,
    uploadGlobalQuotaBytes,
    uploadMaxBytes,
    uploadQuotaBytes,
  }
}

function validUrl(value: string, name: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${name} must be an absolute HTTP URL`)
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${name} must be an HTTP origin without credentials, path, query, or fragment`)
  }
  return url.origin
}

function booleanValue(value: string | undefined, name: string, fallback: boolean) {
  if (value === undefined) return fallback
  if (value === 'true') return true
  if (value === 'false') return false
  throw new Error(`${name} must be true or false`)
}

function positiveInteger(value: string, name: string) {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`)
  return parsed
}
