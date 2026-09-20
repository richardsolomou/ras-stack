import type { PostHogConfig } from 'posthog-js'
import type { PostHogBrowserService } from './config.js'
import { POSTHOG_DISTINCT_ID_HEADER, POSTHOG_SESSION_ID_HEADER, postHogIdentifier } from './request.js'

export { POSTHOG_DISTINCT_ID_HEADER, POSTHOG_SESSION_ID_HEADER } from './request.js'
export const POSTHOG_BROWSER_DEFAULTS = '2026-05-30'

export function postHogBrowserOptions(input: {
  apiHost: string
  uiHost: string
  tracingHostnames?: string[]
  service?: PostHogBrowserService
  options?: Partial<PostHogConfig>
}): Partial<PostHogConfig> {
  const service = input.service
    ? {
        serviceName: required(input.service.name, 'service.name'),
        ...(input.service.version ? { serviceVersion: input.service.version } : {}),
        ...(input.service.environment ? { environment: input.service.environment } : {}),
        ...(input.service.resourceAttributes ? { resourceAttributes: input.service.resourceAttributes } : {}),
      }
    : undefined
  return {
    api_host: required(input.apiHost, 'apiHost'),
    ui_host: required(input.uiHost, 'uiHost'),
    defaults: POSTHOG_BROWSER_DEFAULTS,
    capture_exceptions: true,
    capture_pageview: 'history_change',
    capture_performance: true,
    custom_personal_data_properties: ['token'],
    mask_personal_data_properties: true,
    person_profiles: 'identified_only',
    session_recording: { maskAllInputs: true, blockSelector: '.ph-no-capture' },
    ...(service ? { logs: service, metrics: service } : {}),
    ...(input.tracingHostnames ? { tracing_headers: input.tracingHostnames } : {}),
    ...input.options,
  }
}

export function postHogBrowserHeaders(client: { get_distinct_id(): string; get_session_id(): string | undefined }): Record<string, string> {
  const distinctId = postHogIdentifier(client.get_distinct_id())
  const sessionId = postHogIdentifier(client.get_session_id())
  return {
    ...(distinctId ? { [POSTHOG_DISTINCT_ID_HEADER]: distinctId } : {}),
    ...(sessionId ? { [POSTHOG_SESSION_ID_HEADER]: sessionId } : {}),
  }
}

function required(value: string, name: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${name} is required`)
  return normalized
}
