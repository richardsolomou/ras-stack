import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { realtimeEnvironment } from './environment.js'

describe('realtime environment', () => {
  it('reads prefixed variables and defaults the API key to the shared secret', () => {
    expect(
      realtimeEnvironment({ APP_REALTIME_SECRET: ' s3cret ', APP_REALTIME_API_URL: 'http://realtime:8000/api/' }, { prefix: 'APP_' }),
    ).toEqual({
      apiUrl: 'http://realtime:8000/api',
      apiKey: 's3cret',
      secret: 's3cret',
    })
  })

  it('prefers an explicit API key and the default local API address', () => {
    expect(realtimeEnvironment({ REALTIME_SECRET: 'secret', REALTIME_API_KEY: 'api-key' })).toMatchObject({
      apiUrl: 'http://127.0.0.1:8000/api',
      apiKey: 'api-key',
    })
  })

  it('reads the secret from a file when only its path is configured', async () => {
    const file = join(await mkdtemp(join(tmpdir(), 'ras-stack-realtime-')), 'secret')
    await writeFile(file, 'from-file\n')
    expect(realtimeEnvironment({ REALTIME_SECRET_FILE: file })?.secret).toBe('from-file')
  })

  it('treats a missing secret file as unconfigured', () => {
    expect(realtimeEnvironment({ REALTIME_SECRET_FILE: '/nonexistent/realtime-secret' })).toBeUndefined()
  })

  it('falls back to the development secret outside production only', () => {
    expect(realtimeEnvironment({}, { developmentSecret: 'dev' })?.secret).toBe('dev')
    expect(realtimeEnvironment({ NODE_ENV: 'production' }, { developmentSecret: 'dev' })).toBeUndefined()
  })

  it('returns undefined when nothing configures a secret', () => {
    expect(realtimeEnvironment({})).toBeUndefined()
  })
})
