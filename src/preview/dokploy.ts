import { appendFileSync } from 'node:fs'

export type DokployApplication = { applicationId: string; name: string; serverId?: string | null }

export function dokployPreviewFromEnvironment(environment: NodeJS.ProcessEnv = process.env) {
  const githubOutput = optionalEnvironment(environment, 'GITHUB_OUTPUT')
  const username = optionalEnvironment(environment, 'PREVIEW_REGISTRY_USERNAME')
  const password = optionalEnvironment(environment, 'PREVIEW_REGISTRY_PASSWORD')
  if (Boolean(username) !== Boolean(password)) throw new Error('preview registry username and password must be configured together')
  const port = Number(requiredEnvironment(environment, 'PREVIEW_PORT'))
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('PREVIEW_PORT must be a valid port')
  const applicationPrefix = requiredEnvironment(environment, 'PREVIEW_APPLICATION_PREFIX')
  if (!/^[a-z\d](?:[a-z\d-]*[a-z\d])?$/.test(applicationPrefix)) throw new Error('PREVIEW_APPLICATION_PREFIX must be a slug')
  const domain = optionalEnvironment(environment, 'PREVIEW_DOMAIN')
  if (domain) previewHostname(`pr-1.${domain}`)
  const config = {
    url: requiredEnvironment(environment, 'DOKPLOY_URL'),
    apiKey: requiredEnvironment(environment, 'DOKPLOY_API_KEY'),
    environmentId: requiredEnvironment(environment, 'DOKPLOY_ENVIRONMENT_ID'),
    applicationPrefix,
    domain,
    port,
    healthPath: optionalEnvironment(environment, 'PREVIEW_HEALTH_PATH'),
    ...(username && password ? { registry: { username, password } } : {}),
  }
  const client = new DokployClient(config)
  return {
    config,
    manager: new DokployPreviewManager({
      client,
      applicationName: (prNumber) => `${applicationPrefix}-pr-${prNumber}`,
      ...(domain ? { hostname: (prNumber: string) => `pr-${prNumber}.${domain}` } : {}),
      port,
      ...(config.healthPath ? { healthPath: config.healthPath } : {}),
      ...(githubOutput ? { onResolved: ({ url }: { url: string }) => appendFileSync(githubOutput, `preview-url=${url}\n`) } : {}),
    }),
  }
}

export type DokployClientOptions = {
  url: string
  apiKey: string
  environmentId: string
  fetch?: typeof fetch
  log?: (message: string) => void
}

export class DokployClient {
  private readonly request: typeof fetch
  private readonly log: (message: string) => void

  constructor(private readonly options: DokployClientOptions) {
    this.request = options.fetch ?? fetch
    this.log = options.log ?? console.log
  }

  get environmentId() {
    return this.options.environmentId
  }

  async api<T = unknown>(
    procedure: string,
    options: { query?: Record<string, string>; body?: unknown; signal?: AbortSignal } = {},
  ): Promise<T> {
    const url = new URL(`${this.options.url.replace(/\/$/, '')}/api/${procedure}`)
    for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value)
    this.log(`→ ${procedure}`)
    const response = await this.request(url, {
      method: options.body === undefined ? 'GET' : 'POST',
      headers: {
        'x-api-key': this.options.apiKey,
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    })
    const text = await response.text()
    if (!response.ok) throw new Error(`${procedure} failed with ${response.status}: ${text.slice(0, 500)}`)
    if (!text) return undefined as T
    try {
      return JSON.parse(text) as T
    } catch {
      throw new Error(`${procedure} returned ${response.status} with a non-JSON body: ${text.slice(0, 200)}`)
    }
  }

  async applications() {
    const environment = await this.api<{ applications?: DokployApplication[] } | undefined>('environment.one', {
      query: { environmentId: this.options.environmentId },
    })
    if (!environment) throw new Error('environment.one returned an empty response')
    return environment.applications ?? []
  }

  async application(name: string) {
    return (await this.applications()).find((application) => application.name === name)
  }

  async generateDomain(appName: string, serverId?: string) {
    const generated = await this.api('domain.generateDomain', {
      body: { appName, ...(serverId ? { serverId } : {}) },
    })
    if (typeof generated !== 'string') throw new Error('domain.generateDomain returned an invalid hostname')
    const host = previewHostname(generated)
    if (!host.endsWith('.sslip.io')) throw new Error('domain.generateDomain did not return an sslip.io hostname')
    return host
  }
}

export type DokployPreviewOptions = {
  client: DokployClient
  applicationName: (prNumber: string) => string
  hostname?: (prNumber: string) => string
  port: number
  healthPath?: string
  deploymentTimeoutMs?: number
  healthTimeoutMs?: number
  pollIntervalMs?: number
  fetch?: typeof fetch
  sleep?: (milliseconds: number) => Promise<void>
  now?: () => number
  log?: (message: string) => void
  onResolved?: (context: { host: string; url: string }) => void | Promise<void>
}

export type DeployPreviewOptions = {
  prNumber: string
  image: string
  environment: string | ((context: { host: string; url: string }) => string)
  registry?: { username: string; password: string }
  configure?: (context: { applicationId: string; client: DokployClient; host: string; url: string }) => void | Promise<void>
}

export class DokployPreviewManager {
  private readonly request: typeof fetch
  private readonly pause: (milliseconds: number) => Promise<void>
  private readonly log: (message: string) => void
  private readonly now: () => number

  constructor(private readonly options: DokployPreviewOptions) {
    this.request = options.fetch ?? fetch
    this.pause = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)))
    this.log = options.log ?? console.log
    this.now = options.now ?? Date.now
  }

  async deploy(options: DeployPreviewOptions) {
    const prNumber = pullRequestNumber(options.prNumber)
    const name = this.options.applicationName(prNumber)
    let application = await this.options.client.application(name)
    if (!application) {
      await this.options.client.api('application.create', {
        body: { name, appName: name, environmentId: this.options.client.environmentId },
      })
      application = await this.options.client.application(name)
      if (!application) throw new Error(`Dokploy did not report ${name} after creating it`)
    }
    const applicationId = application.applicationId
    const details = await this.options.client.api<{ domains?: { host: string }[] } | undefined>('application.one', {
      query: { applicationId },
    })
    const generated = !this.options.hostname
    const existingGenerated = generated ? details?.domains?.find((domain) => domain.host.endsWith('.sslip.io')) : undefined
    const host = previewHostname(
      this.options.hostname
        ? this.options.hostname(prNumber)
        : (existingGenerated?.host ?? (await this.options.client.generateDomain(name, application.serverId ?? undefined))),
    )
    const url = `${generated ? 'http' : 'https'}://${host}`
    if (!details?.domains?.some((domain) => domain.host === host)) {
      await this.options.client.api('domain.create', {
        body: {
          applicationId,
          host,
          path: '/',
          port: this.options.port,
          https: !generated,
          certificateType: generated ? 'none' : 'letsencrypt',
          domainType: 'application',
        },
      })
    }
    await this.options.onResolved?.({ host, url })
    await options.configure?.({ applicationId, client: this.options.client, host, url })
    await this.options.client.api('application.saveDockerProvider', {
      body: {
        applicationId,
        dockerImage: options.image,
        username: options.registry?.username ?? null,
        password: options.registry?.password ?? null,
        registryUrl: options.registry ? options.image.split('/')[0] : null,
      },
    })
    await this.options.client.api('application.saveEnvironment', {
      body: {
        applicationId,
        env: typeof options.environment === 'function' ? options.environment({ host, url }) : options.environment,
        buildArgs: null,
        buildSecrets: null,
        createEnvFile: false,
      },
    })
    await this.options.client.api('application.deploy', { body: { applicationId } })
    await this.waitForDeployment(applicationId)
    await this.waitForHealth(new URL(this.options.healthPath ?? '/api/health', url).toString())
    this.log(`Preview ready at ${url}`)
    return { applicationId, host, url }
  }

  async delete(prNumber: string, beforeDelete?: (application: DokployApplication | undefined) => void | Promise<void>) {
    const name = this.options.applicationName(pullRequestNumber(prNumber))
    const application = await this.options.client.application(name)
    await beforeDelete?.(application)
    if (!application) return false
    await this.options.client.api('application.delete', { body: { applicationId: application.applicationId } })
    return true
  }

  async prune(
    openPullRequests: ReadonlySet<string>,
    beforeDelete?: (prNumber: string, application: DokployApplication) => void | Promise<void>,
  ) {
    const deleted: string[] = []
    for (const application of await this.options.client.applications()) {
      const prNumber = previewApplicationPrNumber(application.name, this.options.applicationName)
      if (!prNumber || openPullRequests.has(prNumber)) continue
      // Dokploy mutations are intentionally ordered to avoid overwhelming one environment.
      // oxlint-disable-next-line no-await-in-loop
      await beforeDelete?.(prNumber, application)
      // oxlint-disable-next-line no-await-in-loop
      await this.options.client.api('application.delete', { body: { applicationId: application.applicationId } })
      deleted.push(prNumber)
    }
    return deleted
  }

  private async waitForDeployment(applicationId: string) {
    const deadline = this.now() + (this.options.deploymentTimeoutMs ?? 600_000)
    while (this.now() < deadline) {
      // Polling is intentionally sequential; each response determines whether another request is needed.
      // oxlint-disable-next-line no-await-in-loop
      await this.pause(this.options.pollIntervalMs ?? 5_000)
      let applicationStatus: string
      try {
        // Polling is intentionally sequential; each response determines whether another request is needed.
        // oxlint-disable-next-line no-await-in-loop
        const details = await this.options.client.api<{ applicationStatus: string }>('application.one', {
          query: { applicationId },
          signal: AbortSignal.timeout(Math.max(1, deadline - this.now())),
        })
        applicationStatus = details.applicationStatus
      } catch (error) {
        if (error instanceof DOMException && error.name === 'TimeoutError') break
        throw error
      }
      if (applicationStatus === 'done') return
      if (applicationStatus === 'error') throw new Error('Dokploy reported a failed deployment')
    }
    throw new Error('Timed out waiting for the Dokploy deployment to finish')
  }

  private async waitForHealth(url: string) {
    const deadline = this.now() + (this.options.healthTimeoutMs ?? 300_000)
    let lastFailure = 'no response'
    while (this.now() < deadline) {
      try {
        // Polling is intentionally sequential; each response determines whether another request is needed.
        // oxlint-disable-next-line no-await-in-loop
        const response = await this.request(url, { signal: AbortSignal.timeout(Math.max(1, deadline - this.now())) })
        if (response.status === 200) return
        lastFailure = `status ${response.status}`
      } catch (error) {
        lastFailure = error instanceof Error ? error.message : String(error)
      }
      // oxlint-disable-next-line no-await-in-loop
      await this.pause(this.options.pollIntervalMs ?? 5_000)
    }
    throw new Error(`Timed out waiting for ${url} (${lastFailure})`)
  }
}

export function pullRequestNumber(value: string) {
  if (!/^\d+$/.test(value)) throw new Error('pull request number must contain only digits')
  return value
}

export function previewHostname(value: string) {
  const parsed = new URL(`https://${value}`)
  if (parsed.hostname !== value || parsed.port || parsed.username || parsed.password || parsed.pathname !== '/') {
    throw new Error('preview hostname must be a bare hostname')
  }
  return value
}

function previewApplicationPrNumber(name: string, applicationName: (prNumber: string) => string) {
  const match = /^(\d+)$/.exec(name.match(/(\d+)$/)?.[1] ?? '')
  const prNumber = match?.[1]
  return prNumber && applicationName(prNumber) === name ? prNumber : undefined
}

function requiredEnvironment(environment: NodeJS.ProcessEnv, name: string) {
  const value = optionalEnvironment(environment, name)
  if (!value) throw new Error(`${name} is required`)
  return value
}

function optionalEnvironment(environment: NodeJS.ProcessEnv, name: string) {
  return environment[name]?.trim() || undefined
}
