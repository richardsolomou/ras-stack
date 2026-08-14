import { afterEach, describe, expect, it, vi } from 'vitest'
import { runPreviewCli } from './cli.js'

const dokployEnvironment = {
  DOKPLOY_URL: 'https://dokploy.example',
  DOKPLOY_API_KEY: 'secret',
  DOKPLOY_ENVIRONMENT_ID: 'environment',
  PREVIEW_APPLICATION_PREFIX: 'example',
  PREVIEW_DOMAIN: 'example.com',
  PREVIEW_PORT: '3000',
}

const statusEnvironment = {
  GITHUB_REPOSITORY: 'owner/app',
  GH_TOKEN: 'github-token',
  PREVIEW_MARKER: '<!-- app-preview -->',
  PR_NUMBER: '42',
  COMMIT_SHA: 'a'.repeat(40),
  PREVIEW_URL: 'https://pr-42.example.com',
}

describe('preview CLI', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('rejects a state the preview status does not define', async () => {
    await expect(runPreviewCli(['queued'])).rejects.toThrow('preview state must be awaiting, building, ready, failed, or deleted')
  })

  it('reports the requested state through the GitHub API', async () => {
    stubEnvironment(statusEnvironment)
    const request = vi.fn<typeof globalThis.fetch>(async (input) => {
      const { pathname } = requestUrl(input)
      if (pathname.includes('/commits/')) return Response.json({ check_runs: [] })
      return Response.json(pathname.endsWith('/comments') ? [] : {})
    })
    vi.stubGlobal('fetch', request)
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await runPreviewCli(['ready'])

    expect(request.mock.calls.map(([input]) => requestUrl(input).pathname)).toEqual([
      `/repos/owner/app/commits/${'a'.repeat(40)}/check-runs`,
      '/repos/owner/app/check-runs',
      '/repos/owner/app/issues/42/comments',
      '/repos/owner/app/issues/42/comments',
    ])
    expect(log).toHaveBeenCalledWith('Preview status set to ready')
  })

  it('routes a dokploy argument to the Dokploy preview commands', async () => {
    stubEnvironment(dokployEnvironment)

    await expect(runPreviewCli(['dokploy', 'restart'])).rejects.toThrow('usage: ras preview dokploy <deploy|delete|prune>')
  })
})

function stubEnvironment(environment: Record<string, string>) {
  for (const [name, value] of Object.entries(environment)) vi.stubEnv(name, value)
}

function requestUrl(input: RequestInfo | URL) {
  return new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
}
