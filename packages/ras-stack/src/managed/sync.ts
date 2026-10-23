import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { isMap, isScalar, isSeq, parseDocument } from 'yaml'
import { exists, readJson, writeAtomic } from './files.js'
import { checkConsumer, loadPlan, preparedPlan } from './install.js'
import { runPnpm } from './process.js'

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

function equivalent(actual: string | undefined, expected: string): boolean {
  return actual !== undefined && isDeepStrictEqual(yaml(actual).toJS(), yaml(expected).toJS())
}

export async function syncProject(root: string, options: { check?: boolean; upgrade?: boolean } = {}): Promise<void> {
  const plan = await loadPlan(root)
  await checkConsumer(root, plan)
  const { version } = await readJson<{ version: string }>(new URL('../../package.json', import.meta.url))
  const packages = { ...plan.dependencies, ...plan.devDependencies }
  const workspacePath = join(root, 'pnpm-workspace.yaml')
  const source = (await exists(workspacePath)) ? await readFile(workspacePath, 'utf8') : '{}\n'
  const workspace = yaml(source)
  const hook = 'node_modules/.pnpm-config/ras-stack/pnpmfile.mjs'
  if (workspace.has('pnpmfile') && workspace.get('pnpmfile') !== hook)
    throw new Error('Compose the existing pnpmfile with the shipped RAS hook before enabling managed installation')
  if (options.upgrade || !workspace.hasIn(['configDependencies', 'ras-stack']))
    workspace.setIn(['configDependencies', 'ras-stack'], version)
  workspace.set('pnpmfile', hook)
  const outputs: Record<string, string> = { 'pnpm-workspace.yaml': workspace.toString() }
  const botFiles = await Promise.all(
    ['.github/dependabot.yml', '.github/dependabot.yaml'].map(async (file) => {
      if (!(await exists(join(root, file)))) return []
      return [[file, dependabot(await readFile(join(root, file), 'utf8'), ['ras-stack', ...Object.keys(packages).toSorted()])]]
    }),
  )
  Object.assign(outputs, Object.fromEntries(botFiles.flat()))
  const differences = await Promise.all(
    Object.entries(outputs).map(async ([file, contents]) => {
      const actual = (await exists(join(root, file))) ? await readFile(join(root, file), 'utf8') : undefined
      return equivalent(actual, contents) ? undefined : file
    }),
  )
  const changed = differences.filter((file) => file !== undefined)
  if (options.check) {
    if (changed.length) throw new Error(`Run ras sync; managed files are out of date: ${changed.join(', ')}`)
    await preparedPlan(root)
    return
  }
  await Promise.all(changed.map((file) => writeAtomic(join(root, file), outputs[file]!)))
  await runPnpm(['install', '--no-frozen-lockfile'], root)
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
