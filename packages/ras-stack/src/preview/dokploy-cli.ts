import { randomBytes } from 'node:crypto'
import { CloudflarePreviewDns } from './cloudflare.js'
import { dokployPreviewFromEnvironment, pullRequestNumber } from './dokploy.js'

export async function runDokployPreviewCli(arguments_: string[], environment: NodeJS.ProcessEnv = process.env) {
  const command = arguments_[0]
  const { config, manager } = dokployPreviewFromEnvironment(environment)
  const dns = cloudflarePreviewDnsFromEnvironment(environment, Boolean(config.domain))

  if (command === 'deploy') {
    const prNumber = pullRequestNumber(required(environment, 'PR_NUMBER'))
    await manager.deploy({
      prNumber,
      image: required(environment, 'PREVIEW_IMAGE'),
      environment: ({ url }) => renderPreviewEnvironment(required(environment, 'PREVIEW_ENVIRONMENT'), prNumber, url),
      ...(config.registry ? { registry: config.registry } : {}),
      ...(dns
        ? {
            configure: async ({ client, host, serverId }) =>
              dns.upsert({
                hostname: host,
                originIp: await client.publicIp(serverId),
                owner: `${config.applicationPrefix}-pr-${prNumber}`,
              }),
          }
        : {}),
    })
    return
  }
  if (command === 'delete') {
    const prNumber = pullRequestNumber(required(environment, 'PR_NUMBER'))
    const owner = `${config.applicationPrefix}-pr-${prNumber}`
    const hostname = config.domain ? `${config.subdomainPrefix}-${prNumber}.${config.domain}` : undefined
    console.log(
      (await manager.delete(prNumber, dns && hostname ? () => dns.delete({ hostname, owner }) : undefined))
        ? `Deleted ${owner}`
        : `No preview for pr-${prNumber}`,
    )
    return
  }
  if (command === 'prune') {
    const open = new Set((environment.OPEN_PR_NUMBERS ?? '').split(/\s+/).filter(Boolean).map(pullRequestNumber))
    for (const prNumber of await manager.prune(
      open,
      dns && config.domain
        ? (candidate) =>
            dns.delete({
              hostname: `${config.subdomainPrefix}-${candidate}.${config.domain}`,
              owner: `${config.applicationPrefix}-pr-${candidate}`,
            })
        : undefined,
    ))
      console.log(`Deleted ${config.applicationPrefix}-pr-${prNumber}`)
    return
  }
  throw new Error('usage: ras preview dokploy <deploy|delete|prune>')
}

function cloudflarePreviewDnsFromEnvironment(environment: NodeJS.ProcessEnv, customDomain: boolean) {
  const apiToken = optional(environment, 'CLOUDFLARE_API_TOKEN')
  const zoneId = optional(environment, 'CLOUDFLARE_ZONE_ID')
  if (Boolean(apiToken) !== Boolean(zoneId)) throw new Error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID must be configured together')
  if (!apiToken || !zoneId) return undefined
  if (!customDomain) throw new Error('Cloudflare preview DNS requires PREVIEW_DOMAIN')
  return new CloudflarePreviewDns({ apiToken, zoneId })
}

export function renderPreviewEnvironment(template: string, prNumber: string, previewUrl?: string) {
  if (template.includes('{{PREVIEW_URL}}') && !previewUrl) throw new Error('preview URL is required to render PREVIEW_ENVIRONMENT')
  return template
    .replaceAll('{{PR_NUMBER}}', pullRequestNumber(prNumber))
    .replaceAll('{{PREVIEW_URL}}', previewUrl ?? '')
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
