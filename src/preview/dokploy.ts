export type DokployApplication = { applicationId: string; name: string }

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

  async api<T = unknown>(procedure: string, options: { query?: Record<string, string>; body?: unknown } = {}): Promise<T> {
    const url = new URL(`${this.options.url.replace(/\/$/, '')}/api/${procedure}`)
    for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value)
    this.log(`→ ${procedure}`)
    const response = await this.request(url, {
      method: options.body === undefined ? 'GET' : 'POST',
      headers: {
        'x-api-key': this.options.apiKey,
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
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
}

export type DokployPreviewOptions = {
  client: DokployClient
  applicationName: (prNumber: string) => string
  hostname: (prNumber: string) => string
  port: number
  healthPath?: string
  deploymentTimeoutMs?: number
  healthTimeoutMs?: number
  pollIntervalMs?: number
  fetch?: typeof fetch
  sleep?: (milliseconds: number) => Promise<void>
  now?: () => number
  log?: (message: string) => void
}

export type DeployPreviewOptions = {
  prNumber: string
  image: string
  environment: string
  registry?: { username: string; password: string }
  configure?: (context: { applicationId: string; client: DokployClient; host: string }) => void | Promise<void>
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
    const host = previewHostname(this.options.hostname(prNumber))
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
    if (!details?.domains?.some((domain) => domain.host === host)) {
      await this.options.client.api('domain.create', {
        body: {
          applicationId,
          host,
          path: '/',
          port: this.options.port,
          https: true,
          certificateType: 'letsencrypt',
          domainType: 'application',
        },
      })
    }
    await options.configure?.({ applicationId, client: this.options.client, host })
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
      body: { applicationId, env: options.environment, buildArgs: null, buildSecrets: null, createEnvFile: false },
    })
    await this.options.client.api('application.deploy', { body: { applicationId } })
    await this.waitForDeployment(applicationId)
    const url = `https://${host}`
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
      // oxlint-disable-next-line no-await-in-loop
      const { applicationStatus } = await this.options.client.api<{ applicationStatus: string }>('application.one', {
        query: { applicationId },
      })
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
        const response = await this.request(url)
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
