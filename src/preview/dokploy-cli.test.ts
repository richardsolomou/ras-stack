import { afterEach, describe, expect, it, vi } from 'vitest'
import { dokployPreviewFromEnvironment } from './dokploy.js'
import { renderPreviewEnvironment, runDokployPreviewCli } from './dokploy-cli.js'

const environment = {
  DOKPLOY_URL: 'https://dokploy.example',
  DOKPLOY_API_KEY: 'secret',
  DOKPLOY_ENVIRONMENT_ID: 'environment',
  PREVIEW_APPLICATION_PREFIX: 'example',
  PREVIEW_DOMAIN: 'example.com',
  PREVIEW_PORT: '3000',
}

describe('Dokploy preview CLI configuration', () => {
  it('reads the reusable application lifecycle configuration', () => {
    expect(dokployPreviewFromEnvironment(environment).config).toEqual({
      url: 'https://dokploy.example',
      apiKey: 'secret',
      environmentId: 'environment',
      applicationPrefix: 'example',
      domain: 'example.com',
      port: 3000,
      healthPath: undefined,
    })
  })

  it('validates ports and private registry credentials', () => {
    expect(() => dokployPreviewFromEnvironment({ ...environment, PREVIEW_PORT: '0' })).toThrow('valid port')
    expect(() => dokployPreviewFromEnvironment({ ...environment, PREVIEW_REGISTRY_USERNAME: 'user' })).toThrow('configured together')
  })

  it('renders per-pull-request environment values and fresh secrets', () => {
    const rendered = renderPreviewEnvironment(
      'APP_URL=https://pr-{{PR_NUMBER}}.example.com\nSECRET={{RANDOM_HEX_32}}\nSECRET_2={{RANDOM_HEX_32}}\n',
      '42',
    )
    expect(rendered).toMatch(/^APP_URL=https:\/\/pr-42\.example\.com\nSECRET=[a-f\d]{64}\nSECRET_2=[a-f\d]{64}\n$/)
    const [, first, second] = rendered.match(/SECRET=([^\n]+)\nSECRET_2=([^\n]+)/) ?? []
    expect(first).not.toBe(second)
  })
})

describe('Dokploy preview CLI commands', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('rejects a command outside the preview lifecycle', async () => {
    await expect(runDokployPreviewCli(['restart'], environment)).rejects.toThrow('usage: ras preview dokploy <deploy|delete|prune>')
  })

  it('requires the pull request number before contacting Dokploy', async () => {
    const request = fakeDokploy()
    vi.stubGlobal('fetch', request)

    await expect(runDokployPreviewCli(['deploy'], environment)).rejects.toThrow('PR_NUMBER is required')
    expect(request).not.toHaveBeenCalled()
  })

  it('reports a delete for a pull request that has no preview', async () => {
    vi.stubGlobal('fetch', fakeDokploy())
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await runDokployPreviewCli(['delete'], { ...environment, PR_NUMBER: '42' })

    expect(log).toHaveBeenCalledWith('No preview for pr-42')
  })

  it('prunes only the previews whose pull requests are closed', async () => {
    const request = fakeDokploy([
      { applicationId: 'app-7', name: 'example-pr-7' },
      { applicationId: 'app-9', name: 'example-pr-9' },
    ])
    vi.stubGlobal('fetch', request)
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await runDokployPreviewCli(['prune'], { ...environment, OPEN_PR_NUMBERS: '9' })

    expect(log).toHaveBeenCalledWith('Deleted example-pr-7')
    expect(request.deleted).toEqual(['app-7'])
  })
})

function fakeDokploy(applications: { applicationId: string; name: string }[] = []) {
  const deleted: string[] = []
  const request = Object.assign(
    vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      const procedure = url.pathname.slice('/api/'.length)
      if (procedure === 'environment.one') return Response.json({ applications })
      if (procedure === 'application.delete') {
        if (typeof init?.body !== 'string') throw new Error('test expected a JSON string body')
        deleted.push((JSON.parse(init.body) as { applicationId: string }).applicationId)
      }
      return new Response(null)
    }),
    { deleted },
  )
  return request
}
