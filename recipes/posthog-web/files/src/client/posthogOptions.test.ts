import { describe, expect, it } from 'vitest'
import { postHogEnvironment, serviceName } from '../contracts/posthog'
import { postHogOptions } from './posthogOptions'

const environment = postHogEnvironment({ projectToken: 'phc_test', host: 'https://eu.i.posthog.com' })!
const options = postHogOptions(environment, 'app.example', 'production')

describe('postHogOptions', () => {
  it('sends through the same-origin ingest proxy', () => {
    expect(options.api_host).toBe('/t')
  })

  it('links the toolbar to the project region', () => {
    expect(options.ui_host).toBe('https://eu.posthog.com')
  })

  it('pins the SDK defaults snapshot', () => {
    expect(options.defaults).toBe('2026-05-30')
  })

  it('creates person profiles only for identified users', () => {
    expect(options.person_profiles).toBe('identified_only')
  })

  it('captures exceptions', () => {
    expect(options.capture_exceptions).toBe(true)
  })

  it('masks token query parameters in captured URLs', () => {
    expect([options.mask_personal_data_properties, options.custom_personal_data_properties]).toEqual([true, ['token']])
  })

  it('masks every input in session replay', () => {
    expect(options.session_recording).toEqual({ maskAllInputs: true })
  })

  it('adds tracing headers only to requests to this application', () => {
    expect(options.tracing_headers).toEqual(['app.example'])
  })

  it('names the browser service for logs and metrics', () => {
    expect([options.logs, options.metrics]).toEqual([
      { serviceName: `${serviceName}-web`, environment: 'production' },
      { serviceName: `${serviceName}-web`, environment: 'production' },
    ])
  })

  it('leaves console capture off', () => {
    expect(options.logs).not.toHaveProperty('captureConsoleLogs')
  })
})
