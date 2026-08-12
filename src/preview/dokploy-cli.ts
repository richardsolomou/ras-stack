import { randomBytes } from 'node:crypto'
import { appendFileSync } from 'node:fs'
import { dokployPreviewFromEnvironment, pullRequestNumber } from './dokploy.js'

export async function runDokployPreviewCli(arguments_: string[], environment: NodeJS.ProcessEnv = process.env) {
  const command = arguments_[0]
  const { config, manager } = dokployPreviewFromEnvironment(environment)

  if (command === 'deploy') {
    const prNumber = pullRequestNumber(required(environment, 'PR_NUMBER'))
    const preview = await manager.deploy({
      prNumber,
      image: required(environment, 'PREVIEW_IMAGE'),
      environment: renderPreviewEnvironment(required(environment, 'PREVIEW_ENVIRONMENT'), prNumber),
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

export function renderPreviewEnvironment(template: string, prNumber: string) {
  return template
    .replaceAll('{{PR_NUMBER}}', pullRequestNumber(prNumber))
    .replaceAll('{{RANDOM_HEX_32}}', () => randomBytes(32).toString('hex'))
}

function required(environment: NodeJS.ProcessEnv, name: string) {
  const value = optional(environment, name)
  if (!value) throw new Error(`${name} is required`)
  return value
}

function optional(environment: NodeJS.ProcessEnv, name: string) {
  return environment[name]?.trim() || undefined
}
