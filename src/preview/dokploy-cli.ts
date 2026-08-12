import { appendFileSync } from 'node:fs'
import { DokployClient, DokployPreviewManager, previewHostname, pullRequestNumber } from './dokploy.js'

export async function runDokployPreviewCli(arguments_: string[], environment: NodeJS.ProcessEnv = process.env) {
  const command = arguments_[0]
  const config = dokployPreviewConfigFromEnvironment(environment)
  const client = new DokployClient({ url: config.url, apiKey: config.apiKey, environmentId: config.environmentId })
  const manager = new DokployPreviewManager({
    client,
    applicationName: (prNumber) => `${config.applicationPrefix}-pr-${prNumber}`,
    hostname: (prNumber) => `pr-${prNumber}.${config.domain}`,
    port: config.port,
    ...(config.healthPath ? { healthPath: config.healthPath } : {}),
  })

  if (command === 'deploy') {
    const prNumber = pullRequestNumber(required(environment, 'PR_NUMBER'))
    const preview = await manager.deploy({
      prNumber,
      image: required(environment, 'PREVIEW_IMAGE'),
      environment: required(environment, 'PREVIEW_ENVIRONMENT'),
      ...(config.registry ? { registry: config.registry } : {}),
    })
    if (environment.GITHUB_OUTPUT) appendFileSync(environment.GITHUB_OUTPUT, `preview-url=${preview.url}\n`)
    return
  }
  if (command === 'delete') {
    const prNumber = pullRequestNumber(required(environment, 'PR_NUMBER'))
    console.log((await manager.delete(prNumber)) ? `Deleted ${config.applicationPrefix}-pr-${prNumber}` : `No preview for pr-${prNumber}`)
    return
  }
  if (command === 'prune') {
    const open = new Set((environment.OPEN_PR_NUMBERS ?? '').split(/\s+/).filter(Boolean).map(pullRequestNumber))
    for (const prNumber of await manager.prune(open)) console.log(`Deleted ${config.applicationPrefix}-pr-${prNumber}`)
    return
  }
  throw new Error('usage: ras preview dokploy <deploy|delete|prune>')
}

export function dokployPreviewConfigFromEnvironment(environment: NodeJS.ProcessEnv) {
  const username = optional(environment, 'PREVIEW_REGISTRY_USERNAME')
  const password = optional(environment, 'PREVIEW_REGISTRY_PASSWORD')
  if (Boolean(username) !== Boolean(password)) throw new Error('preview registry username and password must be configured together')
  const port = Number(required(environment, 'PREVIEW_PORT'))
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('PREVIEW_PORT must be a valid port')
  const applicationPrefix = required(environment, 'PREVIEW_APPLICATION_PREFIX')
  if (!/^[a-z\d](?:[a-z\d-]*[a-z\d])?$/.test(applicationPrefix)) throw new Error('PREVIEW_APPLICATION_PREFIX must be a slug')
  const domain = required(environment, 'PREVIEW_DOMAIN')
  previewHostname(`pr-1.${domain}`)
  return {
    url: required(environment, 'DOKPLOY_URL'),
    apiKey: required(environment, 'DOKPLOY_API_KEY'),
    environmentId: required(environment, 'DOKPLOY_ENVIRONMENT_ID'),
    applicationPrefix,
    domain,
    port,
    healthPath: optional(environment, 'PREVIEW_HEALTH_PATH'),
    ...(username && password ? { registry: { username, password } } : {}),
  }
}

function required(environment: NodeJS.ProcessEnv, name: string) {
  const value = optional(environment, name)
  if (!value) throw new Error(`${name} is required`)
  return value
}

function optional(environment: NodeJS.ProcessEnv, name: string) {
  return environment[name]?.trim() || undefined
}
