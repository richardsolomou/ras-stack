import { isIP } from 'node:net'
import { previewHostname } from './dokploy.js'

type CloudflareDnsRecord = {
  id: string
  type: string
  name: string
  content: string
  proxied?: boolean
  comment?: string | null
}

type CloudflareResponse<T> = {
  success: boolean
  result: T
  errors?: { message?: string }[]
}

export type CloudflarePreviewDnsOptions = {
  apiToken: string
  zoneId: string
  fetch?: typeof fetch
}

export class CloudflarePreviewDns {
  private readonly request: typeof fetch
  private readonly baseUrl: string

  constructor(private readonly options: CloudflarePreviewDnsOptions) {
    if (!options.apiToken.trim()) throw new Error('Cloudflare API token is required')
    if (!/^[a-f\d]{32}$/i.test(options.zoneId)) throw new Error('Cloudflare zone ID must contain 32 hexadecimal characters')
    this.request = options.fetch ?? fetch
    this.baseUrl = `https://api.cloudflare.com/client/v4/zones/${options.zoneId}/dns_records`
  }

  async upsert(input: { hostname: string; originIp: string; owner: string }) {
    const hostname = previewHostname(input.hostname)
    if (isIP(input.originIp) !== 4) throw new Error('Cloudflare preview DNS requires a public IPv4 origin')
    const comment = ownerComment(input.owner)
    const records = await this.records(hostname)
    const addressRecords = records.filter((record) => ['A', 'AAAA', 'CNAME'].includes(record.type))
    const managed = addressRecords.filter((record) => record.type === 'A' && record.comment === comment)
    if (managed.length > 1 || addressRecords.some((record) => !managed.includes(record))) {
      throw new Error(`Cloudflare DNS record ${hostname} is not owned by ras-stack`)
    }
    const desired = {
      type: 'A',
      name: hostname,
      content: input.originIp,
      proxied: true,
      ttl: 1,
      comment,
    } as const
    const current = managed[0]
    if (!current) {
      await this.api(this.baseUrl, { method: 'POST', body: desired })
      return
    }
    if (current.content === desired.content && current.proxied === desired.proxied) return
    await this.api(`${this.baseUrl}/${current.id}`, { method: 'PUT', body: desired })
  }

  async delete(input: { hostname: string; owner: string }) {
    const hostname = previewHostname(input.hostname)
    const comment = ownerComment(input.owner)
    const records = await this.records(hostname)
    const managed = records.filter((record) => record.type === 'A' && record.comment === comment)
    if (managed.length > 1) throw new Error(`Cloudflare DNS has multiple records owned by ${input.owner}`)
    if (managed[0]) await this.api(`${this.baseUrl}/${managed[0].id}`, { method: 'DELETE' })
  }

  private async records(hostname: string) {
    const url = new URL(this.baseUrl)
    url.searchParams.set('name', hostname)
    url.searchParams.set('match', 'all')
    return this.api<CloudflareDnsRecord[]>(url.toString())
  }

  private async api<T = unknown>(url: string, options: { method?: string; body?: unknown } = {}) {
    const response = await this.request(url, {
      method: options.method ?? 'GET',
      headers: {
        authorization: `Bearer ${this.options.apiToken}`,
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    })
    const payload = (await response.json()) as CloudflareResponse<T>
    if (!response.ok || !payload.success) {
      const detail =
        payload.errors
          ?.map((error) => error.message)
          .filter(Boolean)
          .join('; ') || response.statusText
      throw new Error(`Cloudflare DNS request failed with ${response.status}: ${detail}`)
    }
    return payload.result
  }
}

function ownerComment(owner: string) {
  if (!/^[a-z\d](?:[a-z\d-]*[a-z\d])?$/.test(owner)) throw new Error('Cloudflare preview DNS owner must be a slug')
  return `ras-stack preview ${owner}`
}
