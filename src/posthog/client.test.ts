import { describe, expect, it } from 'vitest'
import { postHogBrowserHeaders, postHogBrowserOptions } from './client.js'

describe('PostHog browser integration', () => {
  it('applies current SDK and exception defaults while preserving overrides', () => {
    expect(postHogBrowserOptions({ apiHost: '/ingest', uiHost: 'https://us.posthog.com' })).toMatchObject({
      api_host: '/ingest',
      ui_host: 'https://us.posthog.com',
      defaults: '2026-05-30',
      capture_exceptions: true,
      capture_pageview: 'history_change',
      person_profiles: 'identified_only',
      session_recording: { maskAllInputs: true, blockSelector: '.ph-no-capture' },
    })
    expect(
      postHogBrowserOptions({
        apiHost: 'https://us.i.posthog.com',
        uiHost: 'https://us.posthog.com',
        options: { autocapture: false, capture_exceptions: false },
      }),
    ).toMatchObject({ autocapture: false, capture_exceptions: false })
  })

  it('adds request correlation for the current application host', () => {
    expect(
      postHogBrowserOptions({ apiHost: '/ingest', uiHost: 'https://us.posthog.com', tracingHostnames: ['app.example'] }),
    ).toMatchObject({ tracing_headers: ['app.example'] })
  })

  it('propagates bounded distinct and session identifiers', () => {
    expect(
      postHogBrowserHeaders({
        get_distinct_id: () => 'person-123',
        get_session_id: () => 'session-456',
      }),
    ).toEqual({ 'x-posthog-distinct-id': 'person-123', 'x-posthog-session-id': 'session-456' })
  })

  it('drops unsafe identifiers instead of creating headers', () => {
    expect(
      postHogBrowserHeaders({
        get_distinct_id: () => 'person\nspoofed',
        get_session_id: () => 'x'.repeat(129),
      }),
    ).toEqual({})
  })
})
