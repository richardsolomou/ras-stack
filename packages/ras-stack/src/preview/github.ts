import { pullRequestNumber } from './dokploy-preview.js'
import type { PreviewStatusState } from './environment.js'

export type GitHubPreviewOptions = {
  repository: string
  token: string
  marker: string
  note?: string
  fetch?: typeof fetch
}

type ActivePreviewStatus =
  | { state: 'ready'; prNumber: string; sha: string; previewUrl: string; runUrl?: string }
  | {
      state: Exclude<PreviewStatusState, 'deleted' | 'ready'>
      prNumber: string
      sha: string
      previewUrl?: string
      runUrl?: string
    }

export type PreviewStatus = { state: 'deleted'; prNumber: string } | ActivePreviewStatus

type Check = { id: number }
type Comment = { id: number; body?: string }

const checkName = 'PR preview deploy'

export async function reportPreviewStatus(options: GitHubPreviewOptions, status: PreviewStatus) {
  const repository = githubRepository(options.repository)
  const marker = commentMarker(options.marker)
  const prNumber = pullRequestNumber(status.prNumber)
  const request = options.fetch ?? fetch
  const api = <T>(path: string, init?: RequestInit) => github<T>(request, options.token, `/repos/${repository}${path}`, init)

  const validated = status.state === 'deleted' ? status : activeStatus(status)
  if (validated.state !== 'deleted') await updateCheck(api, validated)
  const comments = await issueComments(api, prNumber)
  const existing = comments.find((comment) => comment.body?.includes(marker))
  const body = previewComment({ ...options, marker }, validated, existing?.body)
  if (existing) await api(`/issues/comments/${existing.id}`, jsonRequest('PATCH', { body }))
  else await api(`/issues/${prNumber}/comments`, jsonRequest('POST', { body }))
}

function activeStatus(status: ActivePreviewStatus): ActivePreviewStatus {
  return {
    ...status,
    sha: commitSha(status.sha),
    ...(status.previewUrl ? { previewUrl: webUrl(status.previewUrl, 'preview URL') } : {}),
    ...(status.runUrl ? { runUrl: webUrl(status.runUrl, 'workflow run URL') } : {}),
  }
}

async function updateCheck(api: <T>(path: string, init?: RequestInit) => Promise<T>, status: ActivePreviewStatus) {
  const checks = await api<{ check_runs: Check[] }>(
    `/commits/${status.sha}/check-runs?check_name=${encodeURIComponent(checkName)}&filter=latest`,
  )
  const state = checkState(status.state)
  const body = {
    name: checkName,
    head_sha: status.sha,
    status: state.status,
    ...(state.conclusion ? { conclusion: state.conclusion } : {}),
    ...(status.runUrl ? { details_url: status.runUrl } : {}),
    output: { title: checkName, summary: state.summary },
  }
  const existing = checks.check_runs[0]
  if (existing) await api(`/check-runs/${existing.id}`, jsonRequest('PATCH', body))
  else await api('/check-runs', jsonRequest('POST', body))
}

async function issueComments(api: <T>(path: string, init?: RequestInit) => Promise<T>, prNumber: string, page = 1): Promise<Comment[]> {
  if (page > 10) throw new Error('preview comment lookup exceeded 1,000 comments')
  const comments = await api<Comment[]>(`/issues/${prNumber}/comments?per_page=100&page=${page}`)
  return comments.length < 100 ? comments : [...comments, ...(await issueComments(api, prNumber, page + 1))]
}

function previewComment(options: GitHubPreviewOptions, status: PreviewStatus, previous?: string) {
  if (status.state === 'deleted') return `${options.marker}\n🗑️ Preview deleted because this pull request was closed.`
  const sha = status.sha.slice(0, 7)
  const standingSha = previous?.match(/up to date with commit `([0-9a-f]{7})`/)?.[1]
  const standing = standingSha ? ` The preview of \`${standingSha}\` stays up until it does.` : ''
  const heading = {
    awaiting: `⏸️ The preview of \`${sha}\` is waiting for a maintainer to approve its build.${standing}`,
    building: `🔄 Deploying \`${sha}\`.${standing}`,
    ready: `✅ Preview is up to date with commit \`${sha}\`.`,
    failed: `❌ Deploying commit \`${sha}\` failed${status.runUrl ? ` ([workflow run](${status.runUrl}))` : ''}. The preview may be stale or unavailable.`,
  }[status.state]
  return [
    options.marker,
    heading,
    ...(status.previewUrl ? ['', `Preview: ${status.previewUrl}`] : []),
    ...(options.note ? ['', options.note] : []),
  ].join('\n')
}

function checkState(state: Exclude<PreviewStatusState, 'deleted'>) {
  return {
    awaiting: { status: 'queued', summary: 'The preview build is waiting for workflow approval.' },
    building: { status: 'in_progress', summary: 'A new preview version is deploying.' },
    ready: { status: 'completed', conclusion: 'success', summary: 'The preview is up to date.' },
    failed: { status: 'completed', conclusion: 'failure', summary: 'The preview deployment failed.' },
  }[state]
}

async function github<T>(request: typeof fetch, token: string, path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  headers.set('accept', 'application/vnd.github+json')
  headers.set('authorization', `Bearer ${token}`)
  headers.set('x-github-api-version', '2022-11-28')
  const response = await request(`https://api.github.com${path}`, {
    ...init,
    headers,
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`GitHub ${path.split('?')[0]} failed with ${response.status}: ${text.slice(0, 500)}`)
  return text ? (JSON.parse(text) as T) : (undefined as T)
}

function jsonRequest(method: 'POST' | 'PATCH', body: unknown): RequestInit {
  return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
}

function githubRepository(value: string) {
  if (!/^[a-z\d][\w.-]*\/[a-z\d][\w.-]*$/i.test(value)) throw new Error('repository must use an owner/name identifier')
  return value
}

function commentMarker(value: string) {
  if (!/^<!-- [a-z\d-]+ -->$/i.test(value)) throw new Error('preview marker must be a named HTML comment')
  return value
}

function webUrl(value: string, name: string) {
  const url = new URL(value)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error(`${name} must use HTTP or HTTPS`)
  return url.toString().replace(/\/$/, '')
}

function commitSha(value: string | undefined) {
  if (!value || !/^[0-9a-f]{40}$/i.test(value)) throw new Error('commit SHA must contain 40 hexadecimal characters')
  return value
}
