import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const repository = join(dirname(fileURLToPath(import.meta.url)), '../../..')

let source: string
let app: string

function write(root: string, path: string, content: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), content)
}

function recipe(version: number, starters = '[src/core/starter.ts]') {
  return `---\nname: greet\nversion: ${version}\nsummary: Greets.\nrequires: []\nconflicts: []\ndependencies: [zod]\ndevDependencies: []\nwires: []\nstarters: ${starters}\n---\n`
}

function commit(message: string) {
  execFileSync('git', ['-C', source, 'add', '-A'])
  execFileSync('git', ['-C', source, 'commit', '-qm', message])
  return execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
}

function run(...args: string[]) {
  const { RAS_STACK_DIR: _, ...env } = process.env
  const result = spawnSync('node', [join(source, 'skills/ras-recipes/scripts/recipes.mjs'), ...args, '--app', app, '--ref', 'HEAD'], {
    encoding: 'utf8',
    env,
  })
  return { status: result.status, output: result.stdout + result.stderr }
}

const manifest = () => JSON.parse(readFileSync(join(app, 'ras-recipes.json'), 'utf8'))
const read = (path: string) => readFileSync(join(app, path), 'utf8')

const v1 = 'export function greet(name: string) {\n  return `Hello, ${name}`\n}\n\nexport const punctuation = "."\n'
const v2 = 'export function greet(name: string) {\n  return `Hello, ${name}!`\n}\n\nexport const punctuation = "!"\n'

beforeEach(() => {
  source = mkdtempSync(join(tmpdir(), 'recipes-source-'))
  app = mkdtempSync(join(tmpdir(), 'recipes-app-'))
  execFileSync('git', ['-C', source, 'init', '-q', '-b', 'main'])
  execFileSync('git', ['-C', source, 'config', 'user.email', 'test@example.com'])
  execFileSync('git', ['-C', source, 'config', 'user.name', 'Test'])
  cpSync(join(repository, 'skills/ras-recipes/scripts/recipes.mjs'), join(source, 'skills/ras-recipes/scripts/recipes.mjs'))
  cpSync(join(repository, 'recipes/recipe.mjs'), join(source, 'recipes/recipe.mjs'))
  write(source, 'recipes/package.json', JSON.stringify({ devDependencies: { zod: '4.6.7' } }))
  write(source, 'packages/ras-stack/package.json', JSON.stringify({ version: '5.0.0' }))
  write(source, 'recipes/greet/RECIPE.md', recipe(1))
  write(source, 'recipes/greet/CHANGELOG.md', '# greet\n\n## 1\n\nGreets.\n')
  write(source, 'recipes/greet/files/src/core/greet.ts', v1)
  write(source, 'recipes/greet/files/src/core/old.ts', 'export const old = 1\n')
  write(source, 'recipes/greet/files/src/core/starter.ts', 'export const starter = 1\n')
  write(
    source,
    'recipes/greet/files/src/core/shout.ts',
    "import { greet } from './greet'\n\nexport const shout = (name: string) => greet(name).toUpperCase()\n",
  )
  commit('greet v1')
})

afterEach(() => {
  rmSync(source, { recursive: true, force: true })
  rmSync(app, { recursive: true, force: true })
})

function releaseV2() {
  write(source, 'recipes/greet/RECIPE.md', recipe(2))
  write(source, 'recipes/greet/CHANGELOG.md', '# greet\n\n## 2\n\nExclaims.\n\nUpgrade: none.\n\n## 1\n\nGreets.\n')
  write(source, 'recipes/greet/files/src/core/greet.ts', v2)
  rmSync(join(source, 'recipes/greet/files/src/core/old.ts'))
  write(source, 'recipes/greet/files/src/core/new.ts', 'export const added = true\n')
  write(source, 'recipes/greet/files/src/core/starter.ts', 'export const starter = 2\n')
  return commit('greet v2')
}

function releaseV3() {
  write(source, 'recipes/greet/RECIPE.md', recipe(3))
  write(source, 'recipes/greet/CHANGELOG.md', '# greet\n\n## 3\n\nAdds more.\n\n## 2\n\nExclaims.\n\n## 1\n\nGreets.\n')
  write(source, 'recipes/greet/files/src/core/new.ts', 'export const added = 3\n')
  return commit('greet v3')
}

describe('add', () => {
  it('copies the recipe files', () => {
    run('add', 'greet')
    expect(read('src/core/greet.ts')).toBe(v1)
  })

  it('records the version, commit, and file map', () => {
    run('add', 'greet', '--map', 'src/core/greet.ts=src/lib/greet.ts', '--skip', 'src/core/old.ts')
    expect(manifest().recipes.greet).toMatchObject({
      version: 1,
      files: { 'src/core/greet.ts': 'src/lib/greet.ts', 'src/core/old.ts': null },
      notes: [],
    })
  })

  it('leaves an existing file alone and asks for a manual merge', () => {
    write(app, 'src/core/greet.ts', 'mine\n')
    const { output } = run('add', 'greet')
    expect([read('src/core/greet.ts'), output.includes('Reconcile')]).toEqual(['mine\n', true])
  })

  it('prints the packages the application lacks with their tested versions', () => {
    expect(run('add', 'greet').output).toContain('pnpm add zod@4.6.7')
  })

  it('copies a starter file without tracking it', () => {
    run('add', 'greet')
    expect([read('src/core/starter.ts'), 'src/core/starter.ts' in manifest().recipes.greet.files]).toEqual([
      'export const starter = 1\n',
      false,
    ])
  })

  it('refuses a map target outside the application', () => {
    expect(run('add', 'greet', '--map', 'src/core/greet.ts=../elsewhere.ts').status).toBe(1)
  })

  it('names recipe files whose imports a map moves away', () => {
    expect(run('add', 'greet', '--map', 'src/core/greet.ts=src/lib/greet.ts').output).toContain(
      'src/core/shout.ts imports ./greet, which the application keeps at src/lib/greet.ts',
    )
  })

  it('refuses a recipe that is already recorded', () => {
    run('add', 'greet')
    expect(run('add', 'greet').status).toBe(1)
  })
})

describe('update', () => {
  it('replaces a file the application never changed', () => {
    run('add', 'greet')
    releaseV2()
    run('update', 'greet')
    expect(read('src/core/greet.ts')).toBe(v2)
  })

  it('keeps local changes the recipe change does not touch', () => {
    run('add', 'greet')
    write(app, 'src/core/greet.ts', v1.replace('export const punctuation = "."', 'export const punctuation = "."\nexport const local = 1'))
    releaseV2()
    run('update', 'greet')
    expect(read('src/core/greet.ts')).toContain('Hello, ${name}!')
  })

  it('reports a skipped file the recipe changed', () => {
    run('add', 'greet', '--skip', 'src/core/greet.ts')
    releaseV2()
    expect(run('update', 'greet').output).toContain('the application left it out')
  })

  it('preserves the local addition while merging', () => {
    run('add', 'greet')
    write(app, 'src/core/greet.ts', `// local\n${v1}`)
    releaseV2()
    run('update', 'greet')
    expect(read('src/core/greet.ts').startsWith('// local\n')).toBe(true)
  })

  it('marks a conflicting local change with diff3 markers', () => {
    run('add', 'greet')
    write(app, 'src/core/greet.ts', v1.replace('Hello', 'Hi'))
    releaseV2()
    const { output } = run('update', 'greet')
    expect([read('src/core/greet.ts').includes('||||||| greet@v1'), output.includes('1 conflict')]).toEqual([true, true])
  })

  it('follows a mapped file to its application path', () => {
    run('add', 'greet', '--map', 'src/core/greet.ts=src/lib/greet.ts')
    releaseV2()
    run('update', 'greet')
    expect(read('src/lib/greet.ts')).toBe(v2)
  })

  it('adds a file new in the recipe', () => {
    run('add', 'greet')
    releaseV2()
    run('update', 'greet')
    expect(manifest().recipes.greet.files['src/core/new.ts']).toBe('src/core/new.ts')
  })

  it('removes a file the recipe dropped when the application never changed it', () => {
    run('add', 'greet')
    releaseV2()
    run('update', 'greet')
    expect(existsSync(join(app, 'src/core/old.ts'))).toBe(false)
  })

  it('keeps a dropped file the application changed and asks for a decision', () => {
    run('add', 'greet')
    write(app, 'src/core/old.ts', 'export const old = 2\n')
    releaseV2()
    const { output } = run('update', 'greet')
    expect([existsSync(join(app, 'src/core/old.ts')), output.includes('Decide whether to keep it')]).toEqual([true, true])
  })

  it('does not reintroduce a skipped file', () => {
    run('add', 'greet', '--skip', 'src/core/greet.ts')
    releaseV2()
    run('update', 'greet')
    expect(existsSync(join(app, 'src/core/greet.ts'))).toBe(false)
  })

  it('never touches a starter file the recipe changed', () => {
    run('add', 'greet')
    write(app, 'src/core/starter.ts', 'mine\n')
    releaseV2()
    run('update', 'greet')
    expect(read('src/core/starter.ts')).toBe('mine\n')
  })

  it('records a new recipe file whose path the application already uses as left out', () => {
    run('add', 'greet')
    write(app, 'src/core/new.ts', 'mine\n')
    releaseV2()
    run('update', 'greet')
    expect([read('src/core/new.ts'), manifest().recipes.greet.files['src/core/new.ts']]).toEqual(['mine\n', null])
  })

  it('keeps updating after a new file collided with the application', () => {
    run('add', 'greet')
    write(app, 'src/core/new.ts', 'mine\n')
    releaseV2()
    run('update', 'greet')
    releaseV3()
    expect(run('update', 'greet').status).toBe(0)
  })

  it('refuses to update over uncommitted changes', () => {
    run('add', 'greet')
    execFileSync('git', ['-C', app, 'init', '-q'])
    releaseV2()
    expect(run('update', 'greet').status).toBe(1)
  })

  it('records the new version and commit', () => {
    run('add', 'greet')
    const head = releaseV2()
    run('update', 'greet')
    expect(manifest().recipes.greet).toMatchObject({ version: 2, commit: head })
  })

  it('prints the changelog entries since the recorded version', () => {
    run('add', 'greet')
    releaseV2()
    expect(run('update', 'greet').output).toContain('Upgrade: none.')
  })

  it('keeps the notes the application recorded', () => {
    run('add', 'greet')
    const recorded = manifest()
    recorded.recipes.greet.notes = ['Greets in Greek.']
    writeFileSync(join(app, 'ras-recipes.json'), JSON.stringify(recorded))
    releaseV2()
    run('update', 'greet')
    expect(manifest().recipes.greet.notes).toEqual(['Greets in Greek.'])
  })
})

describe('status', () => {
  it('counts files the application edited', () => {
    run('add', 'greet')
    write(app, 'src/core/greet.ts', 'mine\n')
    expect(run('status').output).toContain('1 edited here')
  })

  it('summarises the changes the application is behind on', () => {
    run('add', 'greet')
    releaseV2()
    expect(run('status').output).toContain('Exclaims.')
  })

  it('reports a recipe behind the source', () => {
    run('add', 'greet')
    releaseV2()
    expect(run('status').output).toContain('behind: v1 → v2')
  })
})
