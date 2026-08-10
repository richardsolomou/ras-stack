import type { GitHubPreviewOptions, PreviewStatus, PreviewStatusState } from './github.js'

const states = new Set<PreviewStatusState>(['awaiting', 'building', 'ready', 'failed', 'deleted'])

export function previewStatusFromEnvironment(stateValue: string | undefined, environment: NodeJS.ProcessEnv = process.env) {
  if (!stateValue || !states.has(stateValue as PreviewStatusState)) {
    throw new Error('preview state must be awaiting, building, ready, failed, or deleted')
  }
  const state = stateValue as PreviewStatusState
  const note = optionalEnvironment(environment, 'PREVIEW_NOTE')
  const checkName = optionalEnvironment(environment, 'PREVIEW_CHECK_NAME')
  const options: GitHubPreviewOptions = {
    repository: requiredEnvironment(environment, 'GITHUB_REPOSITORY'),
    token: requiredEnvironment(environment, 'GH_TOKEN'),
    marker: requiredEnvironment(environment, 'PREVIEW_MARKER'),
    ...(note ? { note } : {}),
    ...(checkName ? { checkName } : {}),
  }
  const prNumber = requiredEnvironment(environment, 'PR_NUMBER')
  const runUrl = optionalEnvironment(environment, 'RUN_URL')
  const status: PreviewStatus =
    state === 'deleted'
      ? { state, prNumber }
      : {
          state,
          prNumber,
          sha: requiredEnvironment(environment, 'COMMIT_SHA'),
          previewUrl: requiredEnvironment(environment, 'PREVIEW_URL'),
          ...(runUrl ? { runUrl } : {}),
        }
  return { options, status }
}

function requiredEnvironment(environment: NodeJS.ProcessEnv, name: string) {
  const value = optionalEnvironment(environment, name)
  if (!value) throw new Error(`${name} is required`)
  return value
}

function optionalEnvironment(environment: NodeJS.ProcessEnv, name: string) {
  return environment[name]?.trim() || undefined
}
