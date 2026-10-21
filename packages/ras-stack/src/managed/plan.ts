import { defineIntegration } from './model.js'
import type { Integration, RasConfig } from './model.js'

export interface InstallationPlan {
  dependencies: Record<string, string>
  commands: NonNullable<Integration['commands']>
  presets: { typescript?: string; oxlint: string[]; vite: string[] }
  allowBuilds: string[]
}

export function installationPlan(config: RasConfig): InstallationPlan {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('ras.config.ts must export a configuration object')
  for (const key of Object.keys(config)) {
    if (!['integrations', 'tooling', 'allowBuilds'].includes(key)) throw new Error(`Unknown RAS configuration field: ${key}`)
  }
  for (const key of ['integrations', 'tooling', 'allowBuilds'] as const) {
    if (config[key] !== undefined && !Array.isArray(config[key])) throw new Error(`${key} must be an array`)
  }
  const dependencies: Record<string, string> = {}
  const commands: Record<string, NonNullable<Integration['commands']>[string]> = {}
  const presets: InstallationPlan['presets'] = { oxlint: [], vite: [] }
  const visiting = new Set<Integration>()
  const visited = new Set<Integration>()
  function add(selection: Integration): void {
    defineIntegration(selection)
    if (visiting.has(selection)) throw new Error(`Circular integration: ${selection.name}`)
    if (visited.has(selection)) return
    visiting.add(selection)
    for (const included of selection.includes ?? []) add(included)
    for (const [name, version] of Object.entries(selection.packages)) {
      if (Object.hasOwn(dependencies, name) && dependencies[name] !== version)
        throw new Error(`Conflicting versions for ${name}: ${dependencies[name]} and ${version}`)
      dependencies[name] = version
    }
    for (const [name, command] of Object.entries(selection.commands ?? {})) {
      if (Object.hasOwn(commands, name) && JSON.stringify(commands[name]) !== JSON.stringify(command))
        throw new Error(`Conflicting command: ${name}`)
      commands[name] = command
    }
    if (selection.presets?.typescript) {
      if (presets.typescript && presets.typescript !== selection.presets.typescript) throw new Error('Select only one TypeScript preset')
      presets.typescript = selection.presets.typescript
    }
    for (const preset of selection.presets?.oxlint ?? []) if (!presets.oxlint.includes(preset)) presets.oxlint.push(preset)
    for (const preset of selection.presets?.vite ?? []) if (!presets.vite.includes(preset)) presets.vite.push(preset)
    visiting.delete(selection)
    visited.add(selection)
  }
  for (const selection of [...(config.integrations ?? []), ...(config.tooling ?? [])]) add(selection)
  const allowBuilds = [...new Set(config.allowBuilds ?? [])].toSorted()
  for (const name of allowBuilds)
    if (!Object.hasOwn(dependencies, name)) throw new Error(`Build approval ${name} must name a selected dependency`)
  for (const [name, command] of Object.entries(commands)) {
    if (!Object.hasOwn(dependencies, command.package) || !/^[\w.-]+$/.test(command.bin)) throw new Error(`Invalid managed command: ${name}`)
  }
  if (presets.typescript && !['base', 'bundler', 'browser', 'library', 'tanstack'].includes(presets.typescript))
    throw new Error('Unknown TypeScript preset')
  for (const preset of presets.oxlint)
    if (!['base', 'application', 'tanstack', 'domain', 'layers'].includes(preset)) throw new Error('Unknown Oxlint preset')
  for (const preset of presets.vite)
    if (!['react', 'start', 'tailwind', 'tailwind-animations', 'nitro', 'posthog'].includes(preset)) throw new Error('Unknown Vite preset')
  return {
    dependencies: Object.fromEntries(Object.entries(dependencies).toSorted(([a], [b]) => a.localeCompare(b))),
    commands,
    presets,
    allowBuilds,
  }
}
