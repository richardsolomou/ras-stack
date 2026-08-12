import { describe, expect, it } from 'vitest'
import { dokployPreviewFromEnvironment } from './dokploy.js'
import { renderPreviewEnvironment } from './dokploy-cli.js'

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
