import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { cp, mkdir, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isStarter, parseRecipe } from './recipe.mjs'

const recipesDir = dirname(fileURLToPath(import.meta.url))
const root = dirname(recipesDir)
const stacksDir = join(root, 'stacks')
// Outside the repository, so formatters and linters do not apply its ignore rules to the assembled application.
const assembledDir = join(tmpdir(), 'ras-stack-recipes')

async function listFiles(dir, prefix = '') {
  const files = []
  for (const entry of await readdir(join(dir, prefix), { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) files.push(...(await listFiles(dir, path)))
    else files.push(path)
  }
  return files.toSorted((a, b) => a.localeCompare(b))
}

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'))

async function loadRecipes(versions) {
  const recipes = new Map()
  for (const entry of await readdir(recipesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !existsSync(join(recipesDir, entry.name, 'RECIPE.md'))) continue
    const dir = join(recipesDir, entry.name)
    const recipe = parseRecipe(await readFile(join(dir, 'RECIPE.md'), 'utf8'), `recipes/${entry.name}/RECIPE.md`)
    if (recipe.name !== entry.name) throw new Error(`recipes/${entry.name}: name is ${recipe.name}`)
    const changelog = existsSync(join(dir, 'CHANGELOG.md')) ? await readFile(join(dir, 'CHANGELOG.md'), 'utf8') : ''
    const latest = /^## (\d+)$/m.exec(changelog)?.[1]
    if (Number(latest) !== recipe.version) throw new Error(`recipes/${recipe.name}: CHANGELOG.md must start with "## ${recipe.version}"`)
    if (!existsSync(join(dir, 'files'))) throw new Error(`recipes/${recipe.name}: missing files/`)
    recipe.files = await listFiles(join(dir, 'files'))
    for (const name of [...recipe.dependencies, ...recipe.devDependencies]) {
      if (!versions[name]) throw new Error(`recipes/${recipe.name}: ${name} has no version in recipes/package.json`)
    }
    for (const path of recipe.wires) {
      if (recipe.files.includes(path)) throw new Error(`recipes/${recipe.name}: wires its own file ${path}`)
    }
    for (const starter of recipe.starters) {
      if (!recipe.files.some((path) => isStarter({ starters: [starter] }, path))) {
        throw new Error(`recipes/${recipe.name}: starter ${starter} matches no file`)
      }
    }
    recipes.set(recipe.name, recipe)
  }
  for (const recipe of recipes.values()) {
    for (const name of [...recipe.requires, ...recipe.conflicts]) {
      if (!recipes.has(name)) throw new Error(`recipes/${recipe.name}: unknown recipe ${name}`)
    }
  }
  return recipes
}

async function loadStacks(recipes, only) {
  const stacks = new Map()
  for (const entry of await readdir(stacksDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (only.length > 0 && !only.includes(entry.name)) continue
    const stack = await readJson(join(stacksDir, entry.name, 'stack.json'))
    stack.name = entry.name
    stack.files = (await listFiles(join(stacksDir, entry.name))).filter((path) => path !== 'stack.json')
    for (const name of stack.recipes) if (!recipes.has(name)) throw new Error(`stacks/${stack.name}: unknown recipe ${name}`)
    stacks.set(stack.name, stack)
  }
  return stacks
}

function versionOf(name, versions, rasStackVersion) {
  const version = versions[name]
  return version === 'workspace:*' ? `^${rasStackVersion}` : version
}

async function assemble(stack, recipes, versions, rasStackVersion, install) {
  const label = `stacks/${stack.name}`
  const selected = stack.recipes.map((name) => recipes.get(name))
  const owners = new Map()
  for (const recipe of selected) {
    for (const name of recipe.requires) if (!stack.recipes.includes(name)) throw new Error(`${label}: ${recipe.name} requires ${name}`)
    for (const name of recipe.conflicts)
      if (stack.recipes.includes(name)) throw new Error(`${label}: ${recipe.name} conflicts with ${name}`)
    for (const path of recipe.files) {
      if (owners.has(path)) throw new Error(`${label}: ${recipe.name} and ${owners.get(path)} both ship ${path}`)
      owners.set(path, recipe.name)
    }
  }
  const wired = new Set(selected.flatMap((recipe) => recipe.wires).filter((path) => owners.has(path)))
  for (const path of stack.files) {
    if (owners.has(path) && !wired.has(path)) throw new Error(`${label}: replaces ${path} from ${owners.get(path)}, which no recipe wires`)
  }
  for (const path of wired) if (!stack.files.includes(path)) throw new Error(`${label}: no wired ${path} to test the wiring`)
  for (const recipe of selected) {
    for (const path of recipe.wires) if (owners.has(path)) stack.testedWiring.add(`${recipe.name} → ${path}`)
  }

  const out = join(assembledDir, stack.name)
  await rm(out, { recursive: true, force: true })
  await mkdir(out, { recursive: true })
  for (const recipe of selected) await cp(join(recipesDir, recipe.name, 'files'), out, { recursive: true })
  for (const path of stack.files) await cp(join(stacksDir, stack.name, path), join(out, path))

  const manifest = await readJson(join(out, 'package.json'))
  if (manifest.dependencies || manifest.devDependencies) throw new Error(`${label}: package.json versions come from recipes/package.json`)
  for (const kind of ['dependencies', 'devDependencies']) {
    const names = [...new Set(selected.flatMap((recipe) => recipe[kind]))].toSorted((a, b) => a.localeCompare(b))
    if (names.length > 0) manifest[kind] = Object.fromEntries(names.map((name) => [name, versionOf(name, versions, rasStackVersion)]))
  }
  await writeFile(join(out, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  if (install) {
    // A real install catches what the shared node_modules hides, such as a package missing from allowBuilds.
    const result = spawnSync('pnpm', ['install', '--no-frozen-lockfile'], { cwd: out, stdio: 'inherit' })
    if (result.status !== 0) throw new Error(`${label}: pnpm install failed`)
  } else await symlink(join(recipesDir, 'node_modules'), join(out, 'node_modules'))
  // Matches the key order oxfmt gives package.json in applications.
  spawnSync(join(out, 'node_modules', '.bin', 'oxfmt'), ['package.json'], { cwd: out, stdio: 'ignore' })
  return { out, manifest }
}

function run(stack, out, manifest) {
  for (const check of stack.checks) {
    const command = manifest.scripts?.[check]
    if (!command) throw new Error(`stacks/${stack.name}: package.json has no ${check} script`)
    console.log(`\n▶ ${stack.name}: ${check} (${command})`)
    const result = spawnSync(command, {
      cwd: out,
      shell: true,
      stdio: 'inherit',
      env: { ...process.env, PATH: `${join(out, 'node_modules', '.bin')}:${process.env.PATH}` },
    })
    if (result.status !== 0) throw new Error(`stacks/${stack.name}: ${check} failed`)
  }
}

const args = process.argv.slice(2)
const assembleOnly = args.includes('--assemble-only')
const install = args.includes('--install')
const names = args.filter((arg) => !arg.startsWith('--'))
const packageJson = await readJson(join(recipesDir, 'package.json'))
const versions = { ...packageJson.dependencies, ...packageJson.devDependencies }
const rasStackVersion = (await readJson(join(root, 'packages', 'ras-stack', 'package.json'))).version

try {
  const recipes = await loadRecipes(versions)
  const stacks = await loadStacks(recipes, names)
  for (const name of names) if (!stacks.has(name)) throw new Error(`unknown stack ${name}`)
  const assembled = []
  for (const stack of stacks.values()) {
    if (names.length > 0 && !names.includes(stack.name)) continue
    stack.testedWiring = new Set()
    assembled.push({ stack, ...(await assemble(stack, recipes, versions, rasStackVersion, install)) })
    console.log(`assembled ${stack.name} in ${join(assembledDir, stack.name)}`)
  }
  // Coverage across all stacks only holds when every stack was assembled.
  if (names.length === 0) {
    const used = new Set([...recipes.values()].flatMap((recipe) => [...recipe.dependencies, ...recipe.devDependencies]))
    const unused = Object.keys(versions).filter((name) => !used.has(name))
    if (unused.length > 0) throw new Error(`recipes/package.json lists packages no recipe uses: ${unused.join(', ')}`)
    const unstacked = [...recipes.keys()].filter((name) => ![...stacks.values()].some((stack) => stack.recipes.includes(name)))
    if (unstacked.length > 0) throw new Error(`recipes in no stack: ${unstacked.join(', ')}`)
    const readme = await readFile(join(recipesDir, 'README.md'), 'utf8')
    const unlisted = [...recipes.keys()].filter((name) => !readme.includes(`[\`${name}\`](${name}/RECIPE.md)`))
    if (unlisted.length > 0) throw new Error(`recipes/README.md does not link: ${unlisted.join(', ')}`)
    const tested = new Set(assembled.flatMap(({ stack }) => [...stack.testedWiring]))
    const untested = [...recipes.values()]
      .flatMap((recipe) => recipe.wires.map((path) => `${recipe.name} → ${path}`))
      .filter((pair) => !tested.has(pair))
    if (untested.length > 0) throw new Error(`wiring no stack tests: ${untested.join(', ')}`)
  }
  if (!assembleOnly) for (const { stack, out, manifest } of assembled) run(stack, out, manifest)
} catch (error) {
  console.error(`\n✖ ${error.message}`)
  process.exit(1)
}
