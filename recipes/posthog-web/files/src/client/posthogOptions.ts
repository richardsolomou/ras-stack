import type { PostHogConfig } from 'posthog-js'
import {
  AnalyticsExtensions,
  ErrorTrackingExtensions,
  FeatureFlagsExtensions,
  LogsExtensions,
  MetricsExtensions,
  SessionReplayExtensions,
  TracingExtensions,
} from 'posthog-js/dist/extension-bundles'
import type { PostHogConfig as SlimPostHogConfig } from 'posthog-js/dist/module.slim'
import { ingestPath, serviceName, type PostHogEnvironment } from '../contracts/posthog'

/** Browser SDK options; `defaults` pins the SDK's behavior to a dated snapshot, so raise it only after reading what changed. */
export function postHogOptions(environment: PostHogEnvironment, hostname: string, mode = import.meta.env.MODE): Partial<PostHogConfig> {
  const service = { serviceName: `${serviceName}-web`, environment: mode }
  const extensions = {
    ...AnalyticsExtensions,
    ...ErrorTrackingExtensions,
    ...FeatureFlagsExtensions,
    ...LogsExtensions,
    ...MetricsExtensions,
    ...SessionReplayExtensions,
    ...TracingExtensions,
  } satisfies SlimPostHogConfig['__extensionClasses']
  return {
    // Vite resolves the SDK to slim, whose extension types have separate private members from the default SDK types.
    __extensionClasses: extensions as unknown as PostHogConfig['__extensionClasses'],
    api_host: ingestPath,
    ui_host: environment.uiHost,
    defaults: '2026-05-30',
    person_profiles: 'identified_only',
    capture_exceptions: true,
    capture_performance: true,
    mask_personal_data_properties: true,
    // Password reset and invitation links carry their secret in `token`.
    custom_personal_data_properties: ['token'],
    session_recording: { maskAllInputs: true },
    // Only this origin's requests carry the person and session headers, so no third party learns them.
    tracing_headers: [hostname],
    logs: service,
    metrics: service,
  }
}
