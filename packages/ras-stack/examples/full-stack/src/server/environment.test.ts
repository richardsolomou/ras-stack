import { describe, expect, it } from 'vitest'
import { loadEnvironment } from './environment'

describe('startup environment', () => {
  it('requires production state and proxy secrets', () => {
    expect(() => loadEnvironment({ NODE_ENV: 'production', APP_URL: 'https://example.test', DATA_DIR: 'relative' })).toThrow(
      'DATA_DIR must be absolute in production',
    )
    expect(() =>
      loadEnvironment({
        NODE_ENV: 'production',
        APP_URL: 'https://example.test',
        DATA_DIR: '/data',
        CENTRIFUGO_API_URL: 'https://realtime.example.test/api',
        CENTRIFUGO_API_KEY: 'key',
      }),
    ).toThrow('CENTRIFUGO_PROXY_SECRET is required when realtime is enabled in production')
  })

  it('rejects ambiguous origins and partial realtime credentials', () => {
    expect(() => loadEnvironment({ APP_URL: 'https://example.test/path' })).toThrow('APP_URL must be an HTTP origin')
    expect(() => loadEnvironment({ CENTRIFUGO_API_URL: 'http://localhost/api' })).toThrow(
      'CENTRIFUGO_API_URL and CENTRIFUGO_API_KEY must be configured together',
    )
  })

  it.each([
    ['UPLOAD_GLOBAL_QUOTA_BYTES', '0'],
    ['UPLOAD_GLOBAL_MAX_FILES', '0'],
  ])('rejects an invalid %s', (name, value) => {
    expect(() => loadEnvironment({ [name]: value })).toThrow(`${name} must be a positive integer`)
  })

  it('requires the global byte cap to accept one maximum-size upload', () => {
    expect(() => loadEnvironment({ UPLOAD_MAX_BYTES: '10', UPLOAD_GLOBAL_QUOTA_BYTES: '9' })).toThrow(
      'UPLOAD_GLOBAL_QUOTA_BYTES must be at least UPLOAD_MAX_BYTES',
    )
  })

  it('supports production startup with realtime disabled', () => {
    expect(loadEnvironment({ NODE_ENV: 'production', APP_URL: 'https://example.test', DATA_DIR: '/data' }).realtimeEnabled).toBe(false)
  })
})
