import { mkdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { isMap, isScalar, isSeq, parseDocument } from 'yaml'
import { environmentFiles } from './environment.js'
import { exists, json, readJson, writeAtomic } from './files.js'
import { checkConsumer, loadPlan } from './install.js'
import { assertPackageName } from './model.js'
import { runPnpm } from './process.js'

interface Manifest {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  ras?: { managedDependencies?: string[]; [key: string]: unknown }
  [key: string]: unknown
}

function yaml(source: string) {
  const document = parseDocument(source)
  if (document.errors.length) throw document.errors[0]
  return document
}

function dependabot(source: string, names: string[]): string {
  const document = yaml(source)
  const updates = document.get('updates')
  if (!isSeq(updates)) throw new Error('Dependabot updates must be a sequence')
  const marker = ' Managed by RAS.'
  for (const update of updates.items) {
    if (!isMap(update) || update.get('package-ecosystem') !== 'npm') continue
    const directories = update.get('directories')
    if (update.get('directory') !== '/' && !(isSeq(directories) && directories.items.some((item) => isScalar(item) && item.value === '/')))
      continue
    let ignore = update.get('ignore')
    if (!ignore) {
      update.set('ignore', document.createNode([]))
      ignore = update.get('ignore')
    }
    if (!isSeq(ignore)) throw new Error('Dependabot ignore must be a sequence')
    ignore.items = ignore.items.filter((item) => !isMap(item) || item.get('dependency-name', true)?.comment !== marker)
    for (const name of names) {
      const item = document.createNode({ 'dependency-name': name })
      const key = item.get('dependency-name', true)
      if (isScalar(key)) key.comment = marker
      ignore.add(item)
    }
  }
  return document.toString()
}

function equivalent(file: string, actual: string | undefined, expected: string): boolean {
  if (actual === undefined) return false
  if (/\.ya?ml$/.test(file)) return isDeepStrictEqual(yaml(actual).toJS(), yaml(expected).toJS())
  if (!file.endsWith('.json')) return actual === expected
  return isDeepStrictEqual(JSON.parse(actual), JSON.parse(expected))
}

export async function syncProject(root: string, options: { check?: boolean; upgrade?: boolean } = {}): Promise<void> {
  const plan = await loadPlan(root)
  await checkConsumer(root)
  const manifest = await readJson<Manifest>(join(root, 'package.json'))
  if (manifest.ras && (typeof manifest.ras !== 'object' || Array.isArray(manifest.ras))) throw new Error('ras must be an object')
  const { version } = await readJson<{ version: string }>(new URL('../../package.json', import.meta.url))
  const packages = { ...plan.dependencies, ...plan.devDependencies }
  const previous = manifest.ras?.managedDependencies ?? []
  if (!Array.isArray(previous)) throw new Error('ras.managedDependencies must be an array')
  for (const name of previous) assertPackageName(name)
  const rasSpecifier = manifest.dependencies?.['ras-stack'] ?? manifest.devDependencies?.['ras-stack'] ?? version
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'] as const) {
    const group = { ...manifest[field] }
    delete group['ras-stack']
    for (const name of new Set([...previous, ...Object.keys(packages)])) delete group[name]
    if (field === 'dependencies') Object.assign(group, plan.dependencies, { 'ras-stack': options.upgrade ? version : rasSpecifier })
    if (field === 'devDependencies') Object.assign(group, plan.devDependencies)
    if (Object.keys(group).length) manifest[field] = Object.fromEntries(Object.entries(group).toSorted(([a], [b]) => a.localeCompare(b)))
    else delete manifest[field]
  }
  manifest.ras = { ...manifest.ras, managedDependencies: Object.keys(packages).toSorted() }
  const outputs: Record<string, string> = { 'package.json': json(manifest) }
  const workspacePath = join(root, 'pnpm-workspace.yaml')
  const source = (await exists(workspacePath)) ? await readFile(workspacePath, 'utf8') : '{}\n'
  const workspace = yaml(source)
  const settings = workspace.toJS() as { overrides?: Record<string, string>; allowBuilds?: Record<string, boolean> } | null
  for (const [name, selected] of Object.entries({ 'ras-stack': version, ...packages })) {
    if (settings?.overrides?.[name] && settings.overrides[name] !== selected)
      throw new Error(`Consumer override conflicts with managed ${name}`)
  }
  for (const name of plan.allowBuilds) {
    if (settings?.allowBuilds?.[name] === false) throw new Error(`Consumer build policy denies ${name}`)
    workspace.setIn(['allowBuilds', name], true)
  }
  if (plan.allowBuilds.length) outputs['pnpm-workspace.yaml'] = workspace.toString()
  const botFiles = await Promise.all(
    ['.github/dependabot.yml', '.github/dependabot.yaml'].map(async (file) => {
      if (!(await exists(join(root, file)))) return []
      return [[file, dependabot(await readFile(join(root, file), 'utf8'), ['ras-stack', ...Object.keys(packages).toSorted()])]]
    }),
  )
  Object.assign(outputs, Object.fromEntries(botFiles.flat()))
  const generated = environmentFiles(plan)
  for (const [file, contents] of Object.entries(generated)) outputs[join('.ras', file)] = contents
  const obsolete = await Promise.all(
    ['vite.config.mjs', 'tsconfig.json', 'oxlint.json', 'vscode-settings.json'].map(async (file) =>
      !Object.hasOwn(generated, file) && (await exists(join(root, '.ras', file))) ? join('.ras', file) : undefined,
    ),
  )
  const stale = obsolete.filter((file) => file !== undefined)
  const differences = await Promise.all(
    Object.entries(outputs).map(async ([file, contents]) => {
      const actual = (await exists(join(root, file))) ? await readFile(join(root, file), 'utf8') : undefined
      return equivalent(file, actual, contents) ? undefined : file
    }),
  )
  const changed = differences.filter((file) => file !== undefined)
  if (options.check) {
    if (changed.length || stale.length) throw new Error(`Run ras sync; managed files are out of date: ${[...changed, ...stale].join(', ')}`)
    return
  }
  await mkdir(join(root, '.ras'), { recursive: true })
  await Promise.all(changed.map((file) => writeAtomic(join(root, file), outputs[file]!)))
  await Promise.all(stale.map((file) => rm(join(root, file))))
  await runPnpm(['install'], root)
}

export async function updateProject(root: string, arguments_: string[]): Promise<void> {
  const target = arguments_[0] ?? 'latest'
  if (arguments_.length > 1 || !/^[a-zA-Z0-9][\w.+-]*$/.test(target)) throw new Error('usage: ras update [version-or-tag]')
  await checkConsumer(root)
  await runPnpm(['dlx', `ras-stack@${target}`, 'sync', '--upgrade'], root)
}

export async function runSyncCli(arguments_: string[]): Promise<void> {
  if (arguments_.some((argument) => !['--check', '--upgrade'].includes(argument))) throw new Error('usage: ras sync [--check]')
  if (arguments_.includes('--check') && arguments_.includes('--upgrade')) throw new Error('usage: ras sync [--check]')
  await syncProject(process.cwd(), { check: arguments_.includes('--check'), upgrade: arguments_.includes('--upgrade') })
}
