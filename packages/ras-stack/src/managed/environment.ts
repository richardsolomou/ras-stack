import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { json, readJson } from './files.js'
import type { InstallationPlan } from './plan.js'

export async function writeEnvironment(directory: string, plan: InstallationPlan): Promise<void> {
  if (plan.presets.typescript) {
    await writeFile(
      join(directory, 'tsconfig.json'),
      json({
        extends: `../node_modules/ras-stack/config/typescript/${plan.presets.typescript}.json`,
        include: ['../src', '../ras.config.ts'],
        exclude: ['../node_modules', '.'],
      }),
    )
  }
  if (plan.presets.oxlint.length) {
    await writeFile(
      join(directory, 'oxlint.json'),
      json({
        extends: plan.presets.oxlint.map(
          (preset) => `../node_modules/ras-stack/config/${preset === 'base' ? 'oxlint.json' : `oxlint/${preset}.json`}`,
        ),
      }),
    )
  }
  if (plan.dependencies.typescript) {
    const settingsPath = join(directory, 'vscode-settings.json')
    await writeFile(
      settingsPath,
      json({ 'typescript.tsdk': 'node_modules/typescript/lib', 'typescript.enablePromptUseWorkspaceTsdk': true }),
    )
  }
  await writeFile(join(directory, 'state.json'), json({ owner: 'ras-stack', rasVersion: await packageVersion(), plan }))
}

export async function commandPath(directory: string, packageName: string, bin: string): Promise<string> {
  const root = join(directory, 'node_modules', packageName)
  const manifest = await readJson<{ bin?: string | Record<string, string> }>(join(root, 'package.json'))
  const target = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.[bin]
  if (!target || target.includes('..') || target.startsWith('/'))
    throw new Error(`${packageName} does not publish a safe ${bin} executable`)
  return join(root, target)
}

const manifest = readJson<{ version: string }>(new URL('../../package.json', import.meta.url))

export async function packageVersion(): Promise<string> {
  return (await manifest).version
}
