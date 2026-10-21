import { installationPlan } from './plan.js'

export interface Integration {
  readonly name: string
  readonly packages: Readonly<Record<string, string>>
  readonly includes?: readonly Integration[]
  readonly commands?: Readonly<Record<string, { readonly package: string; readonly bin: string; readonly args?: readonly string[] }>>
  readonly presets?: { readonly typescript?: string; readonly oxlint?: readonly string[] }
}

export interface RasConfig {
  readonly integrations?: readonly Integration[]
  readonly tooling?: readonly Integration[]
  readonly allowBuilds?: readonly string[]
}

export function assertPackageName(name: string): void {
  if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(name) || ['node_modules', 'ras-stack'].includes(name)) {
    throw new Error(`Invalid managed package name: ${name}`)
  }
}

export function defineIntegration(integration: Integration): Integration {
  if (
    !integration ||
    typeof integration.name !== 'string' ||
    !integration.name ||
    !integration.packages ||
    Array.isArray(integration.packages)
  ) {
    throw new Error('An integration needs a name and packages')
  }
  for (const [name, version] of Object.entries(integration.packages)) {
    assertPackageName(name)
    if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?(?:\+[\da-zA-Z.-]+)?$/.test(version)) {
      throw new Error(`${name} must select an exact version, received ${version}`)
    }
  }
  return integration
}

export function defineConfig(config: RasConfig): RasConfig {
  installationPlan(config)
  return config
}
