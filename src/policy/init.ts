import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { renderedPolicyFiles, type AdoptionPolicy } from './index.js'

export type InitStepName = 'policy' | 'toolchain' | 'typescript' | 'oxlint' | 'workflow' | 'justfile'

export type InitStep = { name: InitStepName; title: string; detail: string }

export type TypeScriptPreset = 'library' | 'bundler' | 'node-bundler' | 'browser' | 'tanstack'

export type InitAnswers = { steps: readonly InitStepName[]; typescriptPreset?: TypeScriptPreset }

export type PlannedFile = { path: string; contents: string; existing?: string }

// Adoption values a generated repository starts from. `init.test.ts` holds these to this repository's own policy.
export const INIT_ADOPTION: AdoptionPolicy = {
  node: '>=24 <25',
  pnpm: '11.15.0',
  just: '1.58.0',
}

export const INIT_STEPS: readonly InitStep[] = [
  {
    name: 'policy',
    title: 'Repository policy',
    detail: 'ras-stack.policy.json plus the Changesets, Dependabot, and pnpm files it generates',
  },
  { name: 'toolchain', title: 'Toolchain versions', detail: 'engines.node and packageManager in package.json' },
  { name: 'typescript', title: 'TypeScript configuration', detail: 'tsconfig.json extending a shared preset' },
  { name: 'oxlint', title: 'Lint configuration', detail: '.oxlintrc.json extending the shared rules' },
  { name: 'workflow', title: 'CI workflow', detail: '.github/workflows/ci.yml calling the shared check workflow' },
  { name: 'justfile', title: 'Command runner', detail: 'justfile wrapping the package scripts' },
]

export async function planRepositoryInit(root: string, answers: InitAnswers, release?: string): Promise<PlannedFile[]> {
  const version = release ?? (await rasStackVersion())
  const selected = new Set(answers.steps)
  const planned: PlannedFile[] = []

  if (selected.has('policy')) {
    const policy = {
      changesets: true,
      dependabot: true,
      pnpm: {},
      adoption: { ...INIT_ADOPTION, minimumRasStackVersion: version, minimumWorkflowRasStackVersion: version },
    }
    planned.push({ path: 'ras-stack.policy.json', contents: `${JSON.stringify(policy, null, 2)}\n` })
    for (const [path, contents] of await renderedPolicyFiles(root, policy)) planned.push({ path, contents })
  }

  if (selected.has('toolchain')) {
    const manifest = await readJson(join(root, 'package.json'))
    if (!manifest) throw new Error('package.json is required before the toolchain can be configured')
    const engines = manifest.engines && typeof manifest.engines === 'object' ? manifest.engines : {}
    const configured = { ...manifest, engines: { ...engines, node: INIT_ADOPTION.node }, packageManager: `pnpm@${INIT_ADOPTION.pnpm}` }
    planned.push({ path: 'package.json', contents: `${JSON.stringify(configured, null, 2)}\n` })
  }

  if (selected.has('typescript')) {
    const preset = answers.typescriptPreset ?? 'library'
    planned.push({
      path: 'tsconfig.json',
      contents: `${JSON.stringify({ extends: `./node_modules/ras-stack/config/typescript/${preset}.json`, compilerOptions: { types: ['node'] }, include: ['src/**/*.ts'] }, null, 2)}\n`,
    })
  }

  if (selected.has('oxlint')) {
    planned.push({
      path: '.oxlintrc.json',
      contents: `${JSON.stringify({ extends: ['./node_modules/ras-stack/config/oxlint.json'] }, null, 2)}\n`,
    })
  }

  if (selected.has('workflow')) planned.push({ path: '.github/workflows/ci.yml', contents: workflow(version) })
  if (selected.has('justfile')) planned.push({ path: 'justfile', contents: JUSTFILE })

  await Promise.all(
    planned.map(async (file) => {
      const existing = await readFile(join(root, file.path), 'utf8').catch(() => undefined)
      if (existing !== undefined) file.existing = existing
    }),
  )
  return planned
}

export async function applyRepositoryInit(root: string, files: readonly PlannedFile[]) {
  await Promise.all(
    files.map(async (file) => {
      const absolute = join(root, file.path)
      await mkdir(dirname(absolute), { recursive: true })
      await writeFile(absolute, file.contents)
    }),
  )
  return files.map((file) => file.path)
}

function workflow(version: string) {
  return `name: CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  check:
    uses: richardsolomou/ras-stack/.github/workflows/check-js.yml@v${version}
    with:
      command: just check
      just-version: '${INIT_ADOPTION.just}'
`
}

const JUSTFILE = `default:
    @just --list

install:
    corepack enable
    pnpm install

format:
    pnpm format

lint:
    pnpm lint

typecheck:
    pnpm typecheck

test *args:
    pnpm exec vitest run {{ args }}

check:
    pnpm check
`

async function readJson(path: string | URL) {
  const source = await readFile(path, 'utf8').catch(() => undefined)
  return source === undefined ? undefined : (JSON.parse(source) as Record<string, unknown>)
}

// The generated workflow pins the release doing the generating, so a new repository starts on a version that exists.
async function rasStackVersion() {
  const manifest = await readJson(new URL('../../package.json', import.meta.url))
  const version = manifest?.version
  if (typeof version !== 'string') throw new Error('ras-stack version is unavailable')
  return version
}
