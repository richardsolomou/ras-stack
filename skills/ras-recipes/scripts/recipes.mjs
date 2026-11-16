#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, isAbsolute, join, posix, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const USAGE = `Usage: recipes.mjs <command> [arguments] [--app DIR] [--ref REF]

  list                          Every recipe at REF with its version and summary.
  show <recipe>                 The recipe's README.md at REF.
  show <recipe> --file PATH     One recipe file at REF.
  show <recipe> --since COMMIT  The recipe's changelog, and its diff and wired stack files from COMMIT to REF.
  status                        The application's recipes, local edits, and newer versions at REF.
  add <recipe> [--map FROM=TO]... [--skip FROM]...
                                Copy the recipe's missing files into the application and record it.
  update <recipe> [--allow-dirty]
                                Merge the recipe's changes since the recorded commit into the application.

--app defaults to the current directory and --ref to origin/main, fetched first.
--map places a recipe file at another application path; --skip records a file the application leaves out, or leaves out a starter file or directory.
The ras-stack checkout is $RAS_STACK_DIR, the repository this script is in, or a clone in ~/.cache/ras-stack.`

const MANIFEST = 'ras-recipes.json'
const REPOSITORY = 'https://github.com/richardsolomou/ras-stack'
const BUFFER = 64 * 1024 * 1024

function findSource() {
  if (process.env.RAS_STACK_DIR) return resolve(process.env.RAS_STACK_DIR)
  const enclosing = resolve(dirname(realpathSync(fileURLToPath(import.meta.url))), '../../..')
  if (existsSync(join(enclosing, '.git')) && existsSync(join(enclosing, 'recipes'))) return enclosing
  const cache = join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'ras-stack')
  if (!existsSync(cache)) {
    console.error(`Cloning ${REPOSITORY} into ${cache}`)
    // A full clone, because a partial one fetches each file it reads over the network and fetches unknown commits on demand.
    execFileSync('git', ['clone', '--quiet', REPOSITORY, cache], { stdio: 'inherit' })
  }
  return cache
}

const source = findSource()

function git(args) {
  return execFileSync('git', ['-C', source, ...args], { encoding: 'utf8', maxBuffer: BUFFER })
}

function readAt(commit, path) {
  const result = spawnSync('git', ['-C', source, 'show', `${commit}:${path}`], { encoding: 'utf8', maxBuffer: BUFFER })
  return result.status === 0 ? result.stdout : undefined
}

function resolveCommit(ref, fetch) {
  if (fetch && spawnSync('git', ['-C', source, 'fetch', '--quiet', 'origin'], { stdio: 'ignore' }).status !== 0) {
    console.error(`warning: could not fetch ${source}; using the local ${ref}`)
  }
  return git(['rev-parse', '--verify', `${ref}^{commit}`]).trim()
}

const parsers = new Map()

/** Each commit's recipes are read with that commit's parser, so a format change never misreads an older recipe. */
async function parserAt(commit) {
  if (!parsers.has(commit)) {
    const code = readAt(commit, 'recipes/recipe.mjs')
    if (code === undefined) throw new Error(`no recipes/recipe.mjs at ${commit.slice(0, 12)}`)
    parsers.set(commit, await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`))
  }
  return parsers.get(commit)
}

/** Older commits describe a recipe in RECIPE.md, and applications keep those commits as merge bases. */
function recipeDocumentAt(commit, name) {
  for (const path of [`recipes/${name}/README.md`, `recipes/${name}/RECIPE.md`]) {
    const text = readAt(commit, path)
    if (text !== undefined) return { path, text }
  }
  return undefined
}

async function recipeAt(commit, name) {
  const document = recipeDocumentAt(commit, name)
  if (!document) return undefined
  const parser = await parserAt(commit)
  const recipe = parser.parseRecipe(document.text, `${document.path} at ${commit.slice(0, 12)}`)
  const starter = (path) => parser.isStarter(recipe, path)
  const all = git(['ls-tree', '-r', '--name-only', commit, `recipes/${name}/files/`])
    .split('\n')
    .filter(Boolean)
    .map((path) => path.slice(`recipes/${name}/files/`.length))
  recipe.files = all.filter((path) => !starter(path))
  recipe.starterFiles = all.filter(starter)
  return recipe
}

function recipeNames(commit) {
  return git(['ls-tree', '-d', '--name-only', commit, 'recipes/'])
    .split('\n')
    .filter(Boolean)
    .map((path) => path.slice('recipes/'.length))
    .filter((name) => recipeDocumentAt(commit, name) !== undefined)
}

function packageVersions(commit) {
  const recipes = JSON.parse(readAt(commit, 'recipes/package.json'))
  const rasStack = JSON.parse(readAt(commit, 'packages/ras-stack/package.json')).version
  const versions = { ...recipes.dependencies, ...recipes.devDependencies }
  return (name) => (versions[name] === 'workspace:*' ? `^${rasStack}` : versions[name])
}

function changelogEntries(commit, name, after) {
  const text = readAt(commit, `recipes/${name}/CHANGELOG.md`) ?? ''
  return text
    .split(/^(?=## \d+$)/m)
    .filter((entry) => Number(/^## (\d+)$/m.exec(entry)?.[1]) > after)
    .map((entry) => entry.trim())
}

function loadManifest(app) {
  const path = join(app, MANIFEST)
  if (!existsSync(path)) return { source: REPOSITORY, recipes: {} }
  return JSON.parse(readFileSync(path, 'utf8'))
}

const byName = ([a], [b]) => a.localeCompare(b)

function saveManifest(app, manifest) {
  manifest.recipes = Object.fromEntries(Object.entries(manifest.recipes).toSorted(byName))
  for (const entry of Object.values(manifest.recipes)) entry.files = Object.fromEntries(Object.entries(entry.files).toSorted(byName))
  writeFileSync(join(app, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`)
  // Formats the manifest the way the application's formatter would, so recording a recipe adds no formatting diff.
  const oxfmt = join(app, 'node_modules', '.bin', 'oxfmt')
  if (existsSync(oxfmt)) spawnSync(oxfmt, [MANIFEST], { cwd: app, stdio: 'ignore' })
}

/** Whether a path stays inside the application, following symbolic links that already exist. */
function insideApp(app, path) {
  const target = resolve(app, path)
  let real = target
  for (let existing = target; ; existing = dirname(existing)) {
    if (existsSync(existing)) {
      real = join(realpathSync(existing), relative(existing, target))
      break
    }
  }
  const offset = relative(realpathSync(app), real)
  return offset !== '' && !offset.startsWith('..') && !isAbsolute(offset)
}

function checkTargets(app, name, targets) {
  const outside = targets.filter((target) => typeof target === 'string' && !insideApp(app, target))
  if (outside.length > 0) throw new Error(`${name}: refusing paths outside the application: ${outside.join(', ')}`)
}

function writeAppFile(app, path, content) {
  mkdirSync(dirname(join(app, path)), { recursive: true })
  writeFileSync(join(app, path), content)
}

function readAppFile(app, path) {
  return existsSync(join(app, path)) ? readFileSync(join(app, path), 'utf8') : undefined
}

function installedPackages(app) {
  const path = join(app, 'package.json')
  if (!existsSync(path)) return {}
  const manifest = JSON.parse(readFileSync(path, 'utf8'))
  return { ...manifest.dependencies, ...manifest.devDependencies }
}

const majorOf = (range) => Number(/(\d+)/.exec(range ?? '')?.[1])

/** The lowest version a range allows, as numbers, or undefined for a range that is not a plain caret, tilde, or exact version. */
function lowestVersion(range) {
  const match = /^[\^~]?(\d+)\.(\d+)\.(\d+)/.exec(range ?? '')
  return match ? match.slice(1).map(Number) : undefined
}

function isOlder(range, tested) {
  const [have, want] = [lowestVersion(range), lowestVersion(tested)]
  if (!have || !want) return majorOf(range) < majorOf(tested)
  const index = have.findIndex((part, position) => part !== want[position])
  return index !== -1 && have[index] < want[index]
}

/**
 * Writes a tested version as a range in the application's style: exact when every version range it has is exact, caret
 * otherwise. A version `recipes/package.json` pins exactly stays exact, because the recipe needs that one.
 */
function rangeStyle(installed) {
  const ranges = Object.values(installed).filter((range) => /^[\^~]?\d/.test(range))
  const exact = ranges.length > 0 && ranges.every((range) => /^\d/.test(range))
  return (version) => (exact || /^\d/.test(version) ? version.replace(/^[\^~]/, '') : `^${version.replace(/^[\^~]/, '')}`)
}

/** The first application source file that imports a `ras-stack/` runtime helper, which only v5 and earlier ship. */
function rasStackHelperImport(app, dir = '') {
  for (const entry of readdirSync(join(app, dir), { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue
    const path = dir ? `${dir}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      const found = rasStackHelperImport(app, path)
      if (found) return found
    } else if (
      /\.(?:[cm]?[jt]sx?)$/.test(entry.name) &&
      /(?:from\s*|import\s*\(\s*)['"]ras-stack\//.test(readFileSync(join(app, path), 'utf8'))
    ) {
      return path
    }
  }
  return undefined
}

const importSpecifier = /(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+)['"]([^'"]+)['"]/gm

/** Packages that skipped files import and no copied file does, which the application need not install. */
function packagesOnlySkippedImport(commit, name, paths, skipped) {
  const imports = (path) =>
    [...(readAt(commit, `recipes/${name}/files/${path}`) ?? '').matchAll(importSpecifier)]
      .map(([, specifier]) => specifier)
      .filter((specifier) => !/^[./#]/.test(specifier) && !specifier.includes(':'))
      .map((specifier) =>
        specifier
          .split('/')
          .slice(0, specifier.startsWith('@') ? 2 : 1)
          .join('/'),
      )
  const kept = new Set(paths.filter((path) => !skipped(path)).flatMap(imports))
  return new Set(
    paths
      .filter(skipped)
      .flatMap(imports)
      .filter((pkg) => !kept.has(pkg)),
  )
}

function printPackages(app, recipe, testedVersion, previous, unused = new Set()) {
  const installed = installedPackages(app)
  const versionOf = (name) => rangeStyle(installed)(testedVersion(name))
  let installs = 0
  for (const [kind, flag] of [
    ['dependencies', ''],
    ['devDependencies', ' -D'],
  ]) {
    const wanted = recipe[kind].filter((name) => !unused.has(name))
    const missing = wanted.filter((name) => !installed[name] && !previous?.[kind].includes(name))
    if (missing.length > 0) console.log(`  pnpm add${flag} ${missing.map((name) => `${name}@${versionOf(name)}`).join(' ')}`)
    installs += missing.length
    const outdated = wanted.filter((name) => installed[name] && isOlder(installed[name], testedVersion(name)))
    for (const name of outdated) {
      const helperImport = name === 'ras-stack' && majorOf(installed[name]) < 6 && rasStackHelperImport(app)
      if (helperImport && majorOf(installed[name]) < 5) {
        console.log(
          `  Set ras-stack to ^5 while ${helperImport} imports its helpers: v5 still ships them, plus the presets tooling extends. Bump it to ${versionOf(name)} once none do.`,
        )
        installs++
      } else if (helperImport) {
        console.log(
          `  Keep ras-stack at ${installed[name]} while ${helperImport} imports its helpers; bump it to ${versionOf(name)} once none do.`,
        )
      } else {
        console.log(
          `  pnpm add${flag} ${name}@${versionOf(name)}   (the application has ${installed[name]}; the recipe is tested with ${testedVersion(name)})`,
        )
        installs++
      }
    }
  }
  if (previous) {
    const current = new Set([...recipe.dependencies, ...recipe.devDependencies])
    const dropped = [...previous.dependencies, ...previous.devDependencies].filter((name) => !current.has(name))
    if (dropped.length > 0)
      console.log(`  The recipe no longer uses: ${dropped.join(', ')}. Remove each unless the application uses it elsewhere.`)
  }
  const leftOut = [...recipe.dependencies, ...recipe.devDependencies].filter((name) => unused.has(name))
  if (leftOut.length > 0)
    console.log(`  Only skipped files import: ${leftOut.join(', ')}. Install each only if the application uses it elsewhere.`)
  if (installs > 0 && recipe.wires.includes('pnpm-workspace.yaml'))
    console.log('  Apply the pnpm-workspace.yaml wiring (allowBuilds) before installing.')
}

/** Three-way merges a recipe file change into the application's copy, leaving diff3 conflict markers. */
function mergeFile(appContent, base, next, labels) {
  const dir = mkdtempSync(join(tmpdir(), 'ras-recipe-'))
  try {
    const files = ['app', 'base', 'next'].map((name) => join(dir, name))
    for (const [index, content] of [appContent, base, next].entries()) writeFileSync(files[index], content)
    const result = spawnSync('git', ['merge-file', '-p', '--diff3', ...labels.flatMap((label) => ['-L', label]), ...files], {
      encoding: 'utf8',
      maxBuffer: BUFFER,
    })
    if (result.status === null || result.status < 0 || result.error) throw new Error(`git merge-file failed: ${result.stderr}`)
    return { content: result.stdout, conflicts: result.status }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** The starter directory that holds `path` when the application already has that directory, whose contents it owns. */
function ownedStarterDirectory(app, recipe, path) {
  return recipe.starters.find((starter) => starter.endsWith('/') && path.startsWith(starter) && existsSync(join(app, starter)))
}

const stripExtension = (path) => path.replace(/\.(m?[jt]sx?)$/, '')

/** Copied recipe files whose relative imports reach a file the application moved, which the move leaves pointing nowhere. */
function importsOfMoved(commit, name, copied, map) {
  const moved = new Map(Object.entries(map).map(([from, to]) => [stripExtension(from), to]))
  const warnings = []
  for (const path of copied) {
    const content = readAt(commit, `recipes/${name}/files/${path}`) ?? ''
    for (const [, specifier] of content.matchAll(/(?:from\s*|import\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const target = moved.get(stripExtension(posix.normalize(posix.join(posix.dirname(path), specifier))))
      if (target) warnings.push(`${map[path] ?? path} imports ${specifier}, which the application keeps at ${target}`)
    }
  }
  return warnings
}

function parseArgs(argv) {
  const options = { positional: [], map: {}, skip: [], allowDirty: false }
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    const value = () => {
      const next = argv[++index]
      if (next === undefined) throw new Error(`${arg} needs a value`)
      return next
    }
    if (arg === '--app') options.app = value()
    else if (arg === '--ref') options.ref = value()
    else if (arg === '--file') options.file = value()
    else if (arg === '--since') options.since = value()
    else if (arg === '--skip') options.skip.push(value())
    else if (arg === '--allow-dirty') options.allowDirty = true
    else if (arg === '--map') {
      const [from, to] = value().split('=')
      if (!from || !to) throw new Error('--map takes FROM=TO')
      options.map[from] = to
    } else if (arg.startsWith('--')) throw new Error(`unknown option ${arg}`)
    else options.positional.push(arg)
  }
  return options
}

async function list(commit) {
  for (const name of recipeNames(commit)) {
    const recipe = await recipeAt(commit, name)
    console.log(`${name.padEnd(24)} v${String(recipe.version).padEnd(4)} ${recipe.summary}`)
  }
}

async function show(commit, name, options) {
  const recipe = await recipeAt(commit, name)
  if (!recipe) throw new Error(`no recipe ${name} at ${commit.slice(0, 12)}`)
  if (options.file) {
    const content = readAt(commit, `recipes/${name}/files/${options.file}`)
    if (content === undefined) throw new Error(`recipe ${name} has no file ${options.file}`)
    process.stdout.write(content)
  } else if (options.since) {
    const since = resolveCommit(options.since, false)
    const before = await recipeAt(since, name)
    console.log(changelogEntries(commit, name, before?.version ?? 0).join('\n\n') || 'No changelog entries.')
    console.log()
    const wired = recipe.wires.map((path) => `:(glob)stacks/*/${path}`)
    if (wired.length > 0)
      console.log(
        `The diff includes the stack files this recipe wires (${recipe.wires.join(', ')}) with every change in this range, including other recipes' changes; apply only this recipe's part.\n`,
      )
    process.stdout.write(git(['diff', since, commit, '--', `recipes/${name}`, ...wired]))
  } else process.stdout.write(recipeDocumentAt(commit, name).text)
}

async function status(app, commit) {
  const manifest = loadManifest(app)
  const entries = Object.entries(manifest.recipes)
  if (entries.length === 0) return console.log(`No ${MANIFEST} recipes in ${app}.`)
  for (const [name, entry] of entries) {
    const latest = await recipeAt(commit, name)
    const behind = latest && latest.version > entry.version
    const state = !latest
      ? 'removed from ras-stack'
      : behind
        ? `behind: v${entry.version} → v${latest.version}`
        : `current at v${entry.version}`
    const outside = Object.values(entry.files).filter((path) => path !== null && !insideApp(app, path))
    const mapped = Object.entries(entry.files).filter(([, path]) => path !== null && !outside.includes(path))
    const missing = mapped.filter(([, path]) => !existsSync(join(app, path))).map(([, path]) => path)
    const edited = mapped.filter(([from, path]) => {
      const current = readAppFile(app, path)
      return current !== undefined && current !== readAt(entry.commit, `recipes/${name}/files/${from}`)
    })
    const details = [
      edited.length > 0 && `${edited.length} edited here`,
      missing.length > 0 && `missing: ${missing.join(', ')}`,
      outside.length > 0 && `ignored paths outside the application: ${outside.join(', ')}`,
    ].filter(Boolean)
    console.log(`${name.padEnd(24)} ${state}${details.length > 0 ? ` (${details.join('; ')})` : ''}`)
    if (behind)
      for (const changelog of changelogEntries(commit, name, entry.version))
        console.log(`    ${changelog.split('\n').find((line) => line && !line.startsWith('#'))}`)
  }
}

async function add(app, commit, name, options) {
  const manifest = loadManifest(app)
  if (manifest.recipes[name]) throw new Error(`${name} is already recorded; use update`)
  const recipe = await recipeAt(commit, name)
  if (!recipe) throw new Error(`no recipe ${name} at ${commit.slice(0, 12)}`)
  const missing = recipe.requires.filter((required) => !manifest.recipes[required])
  if (missing.length > 0) throw new Error(`${name} requires ${missing.join(', ')}; add those first`)
  const recorded = await Promise.all(Object.keys(manifest.recipes).map((other) => recipeAt(commit, other)))
  const conflicting = Object.keys(manifest.recipes).filter(
    (other, index) => recipe.conflicts.includes(other) || recorded[index]?.conflicts.includes(name),
  )
  if (conflicting.length > 0) throw new Error(`${name} conflicts with ${conflicting.join(', ')}`)
  const covers = (skip, path) => skip === path || (skip.endsWith('/') && path.startsWith(skip))
  const skipped = (path) => options.skip.some((skip) => covers(skip, path))
  for (const path of Object.keys(options.map)) {
    if (!recipe.files.includes(path)) throw new Error(`${name} has no tracked file ${path}`)
  }
  for (const skip of options.skip) {
    if (![...recipe.files, ...recipe.starterFiles].some((path) => covers(skip, path))) throw new Error(`${name} has no file ${skip}`)
  }
  checkTargets(app, name, Object.values(options.map))

  const files = {}
  const existing = []
  const copied = []
  for (const path of recipe.files) {
    if (skipped(path)) {
      files[path] = null
      continue
    }
    const target = options.map[path] ?? path
    files[path] = target
    if (existsSync(join(app, target))) existing.push(target === path ? path : `${target} (recipe ${path})`)
    else {
      writeAppFile(app, target, readAt(commit, `recipes/${name}/files/${path}`))
      copied.push(path)
    }
  }
  const owned = [...new Set(recipe.starterFiles.map((path) => ownedStarterDirectory(app, recipe, path)).filter(Boolean))]
  const starters = recipe.starterFiles.filter(
    (path) => !skipped(path) && !ownedStarterDirectory(app, recipe, path) && !existsSync(join(app, path)),
  )
  for (const path of starters) writeAppFile(app, path, readAt(commit, `recipes/${name}/files/${path}`))
  manifest.recipes[name] = { version: recipe.version, commit, files, notes: [] }
  saveManifest(app, manifest)

  console.log(`Recorded ${name} v${recipe.version} at ${commit.slice(0, 12)} in ${MANIFEST}.`)
  for (const [title, items] of /** @type {Array<[string, string[]]>} */ ([
    ['These files already existed and were left alone. Reconcile each with the recipe version by hand', existing],
    ['Starter files copied for the application to replace; updates never touch them', starters],
    ['Starter directories the application already has, left alone', owned],
    ['Imports to fix after moving files', importsOfMoved(commit, name, copied, options.map)],
  ])) {
    if (items.length === 0) continue
    console.log(`\n${title}:`)
    for (const item of items) console.log(`  ${item}`)
  }
  console.log('\nPackages:')
  const unused = packagesOnlySkippedImport(
    commit,
    name,
    [...recipe.files, ...recipe.starterFiles],
    (path) => skipped(path) || Boolean(ownedStarterDirectory(app, recipe, path)),
  )
  printPackages(app, recipe, packageVersions(commit), undefined, unused)
  console.log(`\nNext: apply Wiring and Configuration from \`recipes.mjs show ${name}\`, format, then run the application's checks.`)
}

function dirtyFiles(app) {
  const result = spawnSync('git', ['-C', app, 'status', '--porcelain'], { encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : ''
}

async function update(app, commit, name, options) {
  const manifest = loadManifest(app)
  const entry = manifest.recipes[name]
  if (!entry) throw new Error(`${name} is not recorded in ${MANIFEST}; use add`)
  if (entry.commit === commit) return console.log(`${name} is already at ${commit.slice(0, 12)}.`)
  if (!options.allowDirty && dirtyFiles(app))
    throw new Error('the application has uncommitted changes; commit them so the update is reviewable, or pass --allow-dirty')
  checkTargets(app, name, Object.values(entry.files))
  // The recorded commit's parser runs as code, so it must come from the history being updated to rather than wherever the manifest points.
  if (spawnSync('git', ['-C', source, 'merge-base', '--is-ancestor', entry.commit, commit]).status !== 0) {
    throw new Error(
      `${name}'s recorded commit ${entry.commit.slice(0, 12)} is not in the history of ${commit.slice(0, 12)}; refusing to read it`,
    )
  }
  const previous = await recipeAt(entry.commit, name)
  if (!previous) throw new Error(`${name} does not exist at its recorded commit ${entry.commit.slice(0, 12)}`)
  const next = await recipeAt(commit, name)
  if (!next) throw new Error(`${name} no longer exists at ${commit.slice(0, 12)}; read its changelog and remove it by hand`)
  const labels = ['application', `${name}@v${entry.version}`, `${name}@v${next.version}`]

  const files = { ...entry.files }
  const writes = []
  const removals = []
  /** @type {{ updated: string[], conflicted: string[], manual: string[] }} */
  const report = { updated: [], conflicted: [], manual: [] }
  for (const path of [...new Set([...previous.files, ...next.files])].toSorted((a, b) => a.localeCompare(b))) {
    if (next.starterFiles.includes(path)) {
      if (files[path] !== undefined) report.updated.push(`${files[path] ?? path} (now a starter the application owns; no longer tracked)`)
      delete files[path]
      continue
    }
    const base = readAt(entry.commit, `recipes/${name}/files/${path}`)
    const latest = next.files.includes(path) ? readAt(commit, `recipes/${name}/files/${path}`) : undefined
    if (base === latest) continue
    const target = files[path]
    if (target === null) {
      report.manual.push(`${path}: changed in the recipe, but the application left it out. Check whether the change matters.`)
      continue
    }
    if (target === undefined && base !== undefined) {
      report.manual.push(`${path}: changed in the recipe, but ${MANIFEST} does not track it. Map it in \`files\` to take recipe changes.`)
      continue
    }
    if (target === undefined) {
      if (existsSync(join(app, path))) {
        files[path] = null
        report.manual.push(
          `${path}: new in the recipe, but the application already has a file there; recorded as left out. To take it, move the application's file and map \`files["${path}"]\` to where the recipe's version goes.`,
        )
      } else {
        writes.push([path, latest])
        files[path] = path
        report.updated.push(`${path} (new)`)
      }
      continue
    }
    const current = readAppFile(app, target)
    if (current === undefined) {
      report.manual.push(`${target}: missing from the application, so the recipe change was not applied.`)
      continue
    }
    if (latest === undefined) {
      delete files[path]
      if (current === base) {
        removals.push(target)
        report.updated.push(`${target} (removed)`)
      } else
        report.manual.push(
          `${target}: the recipe removed it, but the application changed it. Decide whether to keep it; it is no longer tracked.`,
        )
      continue
    }
    if (current === base) {
      writes.push([target, latest])
      report.updated.push(target)
      continue
    }
    const merged = mergeFile(current, base, latest, labels)
    writes.push([target, merged.content])
    if (merged.conflicts > 0) report.conflicted.push(`${target} (${merged.conflicts} conflict${merged.conflicts === 1 ? '' : 's'})`)
    else report.updated.push(`${target} (merged with local changes)`)
  }

  for (const path of next.starterFiles) {
    if (previous.starterFiles.includes(path) || previous.files.includes(path)) continue
    const directory = ownedStarterDirectory(app, next, path)
    if (directory)
      report.manual.push(`${path}: a new starter file in ${directory}, which the application owns. Copy it only if it applies.`)
    else if (existsSync(join(app, path)))
      report.manual.push(`${path}: a new starter file, but the application already has a file there. Compare them by hand.`)
    else {
      writes.push([path, readAt(commit, `recipes/${name}/files/${path}`)])
      report.updated.push(`${path} (new starter, yours to replace)`)
    }
  }

  for (const [path, content] of writes) writeAppFile(app, path, content)
  for (const path of removals) rmSync(join(app, path))
  manifest.recipes[name] = { ...entry, version: next.version, commit, files }
  saveManifest(app, manifest)

  console.log(`Updated ${name} v${entry.version} → v${next.version} (${entry.commit.slice(0, 12)} → ${commit.slice(0, 12)}).`)
  /** @type {Array<[string, string[]]>} */
  const sections = [
    ['Applied', report.updated],
    ['Conflicts to resolve (diff3 markers show application, old recipe, new recipe)', report.conflicted],
    ['Needs a decision', report.manual],
  ]
  for (const [title, items] of sections) {
    if (items.length === 0) continue
    console.log(`\n${title}:`)
    for (const item of items) console.log(`  ${item}`)
  }
  for (const required of next.requires) {
    const recorded = manifest.recipes[required]
    const latest = recorded && (await recipeAt(commit, required))
    if (latest && latest.version > recorded.version)
      console.log(`\nwarning: ${name} requires ${required}, which is behind; update it first.`)
  }
  console.log('\nPackages:')
  printPackages(app, next, packageVersions(commit), previous)
  console.log(`\nChangelog:\n${changelogEntries(commit, name, entry.version).join('\n\n') || '  No entries.'}`)
  console.log(
    `\nReview wiring changes with \`recipes.mjs show ${name} --since ${entry.commit.slice(0, 12)}\`, format, then run the application's checks.`,
  )
}

try {
  const [command, ...rest] = process.argv.slice(2)
  if (!['list', 'show', 'status', 'add', 'update'].includes(command)) {
    console.log(USAGE)
    process.exit(command && !['help', '--help', '-h'].includes(command) ? 1 : 0)
  }
  const options = parseArgs(rest)
  const app = resolve(options.app ?? process.cwd())
  const commit = resolveCommit(options.ref ?? 'origin/main', options.ref === undefined)
  const [name] = options.positional
  if (command !== 'list' && command !== 'status' && !name) throw new Error(`${command} needs a recipe name`)
  if (command === 'list') await list(commit)
  else if (command === 'show') await show(commit, name, options)
  else if (command === 'status') await status(app, commit)
  else if (command === 'add') await add(app, commit, name, options)
  else await update(app, commit, name, options)
} catch (error) {
  console.error(`error: ${error.message}`)
  process.exit(1)
}
