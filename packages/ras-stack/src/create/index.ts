import { copyFile, cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

export async function runCreateCli(arguments_: string[]) {
  const dryRun = arguments_.includes('--dry-run')
  const positional = arguments_.filter((argument) => argument !== '--dry-run')
  if (positional.length !== 1) {
    console.error('usage: ras create <directory> [--dry-run]')
    process.exitCode = 2
    return
  }
  const destination = path.resolve(positional[0]!)
  const source = path.resolve(import.meta.dirname, '../../examples/full-stack')
  await assertSource(source)
  await assertEmptyDestination(destination)
  if (dryRun) {
    console.log(destination)
    return
  }
  await mkdir(destination, { recursive: true })
  await cp(source, destination, {
    recursive: true,
    filter: (entry) => !excluded(path.relative(source, entry)),
  })
  await materializeTemplate(destination, 'gitignore.template', '.gitignore')
  await materializeTemplate(destination, 'dockerignore.template', '.dockerignore')
  await materializeTemplate(destination, 'pnpm-workspace.template.yaml', 'pnpm-workspace.yaml')
  await copyFile(path.join(destination, 'Dockerfile.standalone'), path.join(destination, 'Dockerfile'))
  await rm(path.join(destination, 'Dockerfile.standalone'))
  const packageFile = path.join(destination, 'package.json')
  const manifest = JSON.parse(await readFile(packageFile, 'utf8')) as {
    name: string
    dependencies: Record<string, string>
    scripts: Record<string, string>
  }
  const packageManifest = JSON.parse(await readFile(path.resolve(import.meta.dirname, '../../package.json'), 'utf8')) as { version: string }
  manifest.name = packageName(path.basename(destination))
  manifest.dependencies['ras-stack'] = `^${packageManifest.version}`
  manifest.scripts.build = manifest.scripts.build!.replaceAll('node ../../dist/cli.js', 'ras')
  await writeFile(packageFile, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(destination)
}

async function materializeTemplate(directory: string, template: string, output: string) {
  const source = path.join(directory, template)
  await copyFile(source, path.join(directory, output))
  await rm(source)
}

function excluded(relative: string) {
  const [root] = relative.split(path.sep)
  return ['.output', '.data', 'node_modules', 'test-results'].includes(root ?? '')
}

async function assertSource(source: string) {
  if (!(await stat(path.join(source, 'package.json'))).isFile()) throw new Error('The packaged full-stack starter is missing')
}

async function assertEmptyDestination(destination: string) {
  try {
    const info = await stat(destination)
    if (!info.isDirectory() || (await readdir(destination)).length > 0)
      throw new Error(`Destination must be an empty directory: ${destination}`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

function packageName(name: string) {
  const normalized = name
    .toLowerCase()
    .replaceAll(/[^a-z\d._-]/g, '-')
    .replaceAll(/^-+|-+$/g, '')
  return normalized || 'ras-stack-app'
}
