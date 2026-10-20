import type { GitHubPreviewOptions, PreviewStatus } from './github.js'

export const previewStates = ['awaiting', 'building', 'ready', 'failed', 'deleted'] as const
export type PreviewStatusState = (typeof previewStates)[number]

export function previewStatusFromEnvironment(
  stateValue: string | undefined,
  environment: NodeJS.ProcessEnv = process.env,
): { options: GitHubPreviewOptions; status: PreviewStatus } {
  const state = previewStates.find((candidate) => candidate === stateValue)
  if (!state) throw new Error('preview state must be awaiting, building, ready, failed, or deleted')
  const note = optionalEnvironment(environment, 'PREVIEW_NOTE')
  const options: GitHubPreviewOptions = {
    repository: requiredEnvironment(environment, 'GITHUB_REPOSITORY'),
    token: requiredEnvironment(environment, 'GH_TOKEN'),
    marker: requiredEnvironment(environment, 'PREVIEW_MARKER'),
    ...(note ? { note } : {}),
  }
  const prNumber = requiredEnvironment(environment, 'PR_NUMBER')
  if (state === 'deleted') return { options, status: { state, prNumber } }
  const runUrl = optionalEnvironment(environment, 'RUN_URL')
  const details = { prNumber, sha: requiredEnvironment(environment, 'COMMIT_SHA'), ...(runUrl ? { runUrl } : {}) }
  const previewUrl = optionalEnvironment(environment, 'PREVIEW_URL')
  if (state === 'ready') {
    if (!previewUrl) throw new Error('PREVIEW_URL is required')
    return { options, status: { state, ...details, previewUrl } }
  }
  return { options, status: { state, ...details, ...(previewUrl ? { previewUrl } : {}) } }
}

export function requiredEnvironment(environment: NodeJS.ProcessEnv, name: string) {
  const value = optionalEnvironment(environment, name)
  if (!value) throw new Error(`${name} is required`)
  return value
}

export function optionalEnvironment(environment: NodeJS.ProcessEnv, name: string) {
  return environment[name]?.trim() || undefined
}
