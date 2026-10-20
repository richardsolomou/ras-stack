import { DokployClient, DokployPreviewManager } from './dokploy-preview.js'
import type { DokployPreviewOptions } from './dokploy-preview.js'

export function requestUrl(input: RequestInfo | URL) {
  return new URL(input instanceof Request ? input.url : input)
}

type FakeDokployOptions = {
  applications?: { applicationId: string; name: string; serverId?: string }[]
  deploymentStatus?: string
  domains?: { domainId?: string; host: string }[]
  generatedDomain?: string
  serverIp?: string
}

// Answers every non-Dokploy request as a healthy preview.
export function fakeDokploy({
  applications = [],
  deploymentStatus = 'done',
  domains = [],
  generatedDomain = 'ras-preview-a1b2c3-1-1-1-1.sslip.io',
  serverIp = '1.1.1.1',
}: FakeDokployOptions = {}) {
  const procedures: string[] = []
  const bodies = new Map<string, unknown>()
  const events: string[] = []
  const healthUrls: string[] = []
  let deployed = false
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = requestUrl(input)
    if (url.hostname !== 'dokploy.example') {
      events.push('health')
      healthUrls.push(url.toString())
      return new Response('healthy')
    }
    const procedure = url.pathname.slice('/api/'.length)
    events.push(procedure)
    procedures.push(procedure)
    if (init?.body !== undefined && typeof init.body !== 'string') throw new Error('test expected a JSON string body')
    const body = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : undefined
    if (body !== undefined) bodies.set(procedure, body)
    if (procedure === 'environment.one') {
      return Response.json({ applications: applications.map(({ applicationId, name }) => ({ applicationId, name })) })
    }
    if (procedure === 'application.create') {
      applications.push({ applicationId: 'app-42', name: String(body?.name) })
      return new Response(null)
    }
    if (procedure === 'application.delete') {
      const index = applications.findIndex((application) => application.applicationId === body?.applicationId)
      if (index !== -1) applications.splice(index, 1)
    }
    if (procedure === 'settings.getIp') return Response.json(serverIp)
    if (procedure === 'domain.canGenerateTraefikMeDomains') return Response.json(serverIp)
    if (procedure === 'domain.generateDomain') return Response.json(generatedDomain)
    if (procedure === 'domain.create') domains.push({ domainId: `domain-${domains.length + 1}`, host: String(body?.host) })
    if (procedure === 'domain.delete') {
      const index = domains.findIndex((domain) => domain.domainId === body?.domainId)
      if (index !== -1) domains.splice(index, 1)
    }
    if (procedure === 'application.deploy') deployed = true
    if (procedure === 'application.one') {
      if (deployed && deploymentStatus === 'hang') {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
        })
      }
      const applicationId = url.searchParams.get('applicationId')
      const application = applications.find((candidate) => candidate.applicationId === applicationId)
      return Response.json(deployed ? { applicationStatus: deploymentStatus } : { domains, serverId: application?.serverId ?? null })
    }
    return new Response(null)
  }
  return { applications, bodies, events, fetch, healthUrls, procedures }
}

export function previewManager(fetch: typeof globalThis.fetch, options: Partial<Omit<DokployPreviewOptions, 'client'>> = {}) {
  const client = new DokployClient({
    url: 'https://dokploy.example',
    apiKey: 'secret',
    environmentId: 'environment',
    fetch,
    log: () => undefined,
  })
  return new DokployPreviewManager({
    client,
    applicationName: (prNumber) => `example-pr-${prNumber}`,
    port: 3000,
    fetch,
    sleep: async () => undefined,
    log: () => undefined,
    ...options,
  })
}
