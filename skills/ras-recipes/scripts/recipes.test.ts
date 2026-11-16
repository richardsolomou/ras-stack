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

function recipe(
  version: number,
  starters = '[src/core/starter.ts]',
  { name = 'greet', requires = '[]', dependencies = '[zod]', conflicts = '[]', wires = '[]' } = {},
) {
  return `---\nname: ${name}\nversion: ${version}\nsummary: Greets.\nrequires: ${requires}\nconflicts: ${conflicts}\ndependencies: ${dependencies}\ndevDependencies: []\nwires: ${wires}\nstarters: ${starters}\n---\n`
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

  it('prints the packages the application lacks as caret ranges of their tested versions', () => {
    expect(run('add', 'greet').output).toContain('pnpm add zod@^4.6.7')
  })

  it('prints exact versions when the application pins its packages exactly', () => {
    write(app, 'package.json', JSON.stringify({ dependencies: { react: '19.3.1' } }))
    expect(run('add', 'greet').output).toContain('pnpm add zod@4.6.7\n')
  })

  it('asks for the tested version when the application has an older major', () => {
    write(app, 'package.json', JSON.stringify({ dependencies: { zod: '^3.0.0' } }))
    expect(run('add', 'greet').output).toContain('pnpm add zod@^4.6.7   (the application has ^3.0.0')
  })

  it('asks for the tested version when the application has an older one in the same major', () => {
    write(app, 'package.json', JSON.stringify({ dependencies: { zod: '^4.5.0' } }))
    expect(run('add', 'greet').output).toContain('pnpm add zod@^4.6.7   (the application has ^4.5.0')
  })

  it('keeps a newer version the application already has', () => {
    write(app, 'package.json', JSON.stringify({ dependencies: { zod: '^4.7.0' } }))
    expect(run('add', 'greet').output).not.toContain('pnpm add')
  })

  it('says skipped files may leave a printed package unused', () => {
    expect(run('add', 'greet', '--skip', 'src/core/old.ts').output).toContain('install only the packages')
  })

  describe('with a recipe that wires pnpm-workspace.yaml', () => {
    beforeEach(() => {
      write(source, 'recipes/greet/RECIPE.md', recipe(1, undefined, { wires: '[pnpm-workspace.yaml]' }))
      commit('greet wires the workspace')
    })

    it('asks for the wiring before installing', () => {
      expect(run('add', 'greet').output).toContain('Apply the pnpm-workspace.yaml wiring')
    })

    it('leaves the wiring out of the packages when nothing needs installing', () => {
      write(app, 'package.json', JSON.stringify({ dependencies: { zod: '^4.6.7' } }))
      expect(run('add', 'greet').output).not.toContain('Apply the pnpm-workspace.yaml wiring')
    })
  })

  describe('with an application on an older ras-stack', () => {
    beforeEach(() => {
      write(source, 'recipes/package.json', JSON.stringify({ devDependencies: { zod: '4.6.7', 'ras-stack': 'workspace:*' } }))
      write(source, 'packages/ras-stack/package.json', JSON.stringify({ version: '6.0.0' }))
      write(source, 'recipes/greet/RECIPE.md', recipe(1, undefined, { dependencies: '[ras-stack]' }))
      commit('greet on ras-stack')
      write(app, 'package.json', JSON.stringify({ devDependencies: { 'ras-stack': '^5.2.0' } }))
    })

    it('keeps the older major while the source imports its helpers', () => {
      write(app, 'src/router.tsx', "import { createRouter } from 'ras-stack/tanstack/router'\n")
      expect(run('add', 'greet').output).toContain(
        'Keep ras-stack at ^5.2.0 while src/router.tsx imports its helpers; bump it to ^6.0.0 once none do.',
      )
    })

    it('asks for v5 while the source imports the helpers of a version without presets', () => {
      write(app, 'package.json', JSON.stringify({ devDependencies: { 'ras-stack': '^4.1.0' } }))
      write(app, 'src/router.tsx', "import { createRouter } from 'ras-stack/tanstack/router'\n")
      expect(run('add', 'greet').output).toContain(
        'Set ras-stack to ^5 while src/router.tsx imports its helpers: v5 still ships them, plus the presets tooling extends. Bump it to ^6.0.0 once none do.',
      )
    })

    it('asks for the newer major once nothing imports its helpers', () => {
      write(app, 'src/router.tsx', "import { createRouter } from '@tanstack/react-router'\n")
      expect(run('add', 'greet').output).toContain('pnpm add ras-stack@^6.0.0   (the application has ^5.2.0')
    })
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

  it('refuses a recipe that a recorded recipe conflicts with', () => {
    write(source, 'recipes/greet/RECIPE.md', recipe(1, undefined, { conflicts: '[wave]' }))
    write(source, 'recipes/wave/RECIPE.md', recipe(1, '[]', { name: 'wave' }))
    write(source, 'recipes/wave/CHANGELOG.md', '# wave\n\n## 1\n\nWaves.\n')
    write(source, 'recipes/wave/files/src/core/wave.ts', 'export const wave = 1\n')
    commit('wave')
    run('add', 'greet')
    expect(run('add', 'wave').output).toContain('wave conflicts with greet')
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

  it('merges a local change the recipe change does not touch without conflict', () => {
    run('add', 'greet')
    write(app, 'src/core/greet.ts', `export const local = 1\n\n${v1}`)
    releaseV2()
    const { output } = run('update', 'greet')
    expect([read('src/core/greet.ts'), output.includes('merged with local changes')]).toEqual([`export const local = 1\n\n${v2}`, true])
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

  it('keeps a file that became a starter and stops tracking it', () => {
    run('add', 'greet')
    write(source, 'recipes/greet/RECIPE.md', recipe(2, '[src/core/starter.ts, src/core/old.ts]'))
    write(source, 'recipes/greet/CHANGELOG.md', '# greet\n\n## 2\n\nOld is yours.\n\n## 1\n\nGreets.\n')
    write(source, 'recipes/greet/files/src/core/old.ts', 'export const old = 2\n')
    commit('greet v2')
    run('update', 'greet')
    expect([read('src/core/old.ts'), 'src/core/old.ts' in manifest().recipes.greet.files]).toEqual(['export const old = 1\n', false])
  })

  it('copies a starter file new in the recipe', () => {
    run('add', 'greet')
    write(source, 'recipes/greet/RECIPE.md', recipe(2, '[src/core/starter.ts, src/core/page.ts]'))
    write(source, 'recipes/greet/CHANGELOG.md', '# greet\n\n## 2\n\nA page.\n\n## 1\n\nGreets.\n')
    write(source, 'recipes/greet/files/src/core/page.ts', 'export const page = 1\n')
    commit('greet v2')
    run('update', 'greet')
    expect(read('src/core/page.ts')).toBe('export const page = 1\n')
  })

  it('refuses a recorded path outside the application', () => {
    run('add', 'greet')
    const recorded = manifest()
    recorded.recipes.greet.files['src/core/greet.ts'] = '../victim.ts'
    writeFileSync(join(app, 'ras-recipes.json'), JSON.stringify(recorded))
    releaseV2()
    expect([run('update', 'greet').status, existsSync(join(app, '../victim.ts'))]).toEqual([1, false])
  })

  it('refuses a recorded commit outside the history it updates to', () => {
    run('add', 'greet')
    execFileSync('git', ['-C', source, 'checkout', '-qb', 'side'])
    write(source, 'recipes/greet/files/src/core/greet.ts', 'export const side = 1\n')
    const side = commit('side')
    execFileSync('git', ['-C', source, 'checkout', '-q', 'main'])
    const recorded = manifest()
    recorded.recipes.greet.commit = side
    writeFileSync(join(app, 'ras-recipes.json'), JSON.stringify(recorded))
    releaseV2()
    expect(run('update', 'greet').output).toContain('is not in the history')
  })

  it('names packages the recipe no longer uses', () => {
    run('add', 'greet')
    write(source, 'recipes/greet/RECIPE.md', recipe(2, undefined, { dependencies: '[]' }))
    write(source, 'recipes/greet/CHANGELOG.md', '# greet\n\n## 2\n\nNo zod.\n\n## 1\n\nGreets.\n')
    commit('greet v2')
    expect(run('update', 'greet').output).toContain('The recipe no longer uses: zod')
  })

  it('warns when a required recipe is behind', () => {
    write(source, 'recipes/shout/RECIPE.md', recipe(1, '[]', { name: 'shout', requires: '[greet]' }))
    write(source, 'recipes/shout/CHANGELOG.md', '# shout\n\n## 1\n\nShouts.\n')
    write(source, 'recipes/shout/files/src/core/loud.ts', 'export const loud = 1\n')
    commit('shout v1')
    run('add', 'greet')
    run('add', 'shout')
    releaseV2()
    write(source, 'recipes/shout/RECIPE.md', recipe(2, '[]', { name: 'shout', requires: '[greet]' }))
    write(source, 'recipes/shout/CHANGELOG.md', '# shout\n\n## 2\n\nLouder.\n\n## 1\n\nShouts.\n')
    write(source, 'recipes/shout/files/src/core/loud.ts', 'export const loud = 2\n')
    commit('shout v2')
    expect(run('update', 'shout').output).toContain('requires greet, which is behind')
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

describe('show', () => {
  it('prints the changelog and diff since a commit', () => {
    const first = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    releaseV2()
    const { output } = run('show', 'greet', '--since', first)
    expect([output.includes('Exclaims.'), output.includes('+  return `Hello, ${name}!`')]).toEqual([true, true])
  })

  it("says the wired stack files may carry other recipes' changes", () => {
    const first = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    write(source, 'recipes/greet/RECIPE.md', recipe(2, undefined, { wires: '[vite.config.ts]' }))
    commit('greet wires vite')
    expect(run('show', 'greet', '--since', first).output).toContain("other recipes' changes")
  })
})

describe('status', () => {
  it('reports a recipe removed from the source', () => {
    run('add', 'greet')
    rmSync(join(source, 'recipes/greet'), { recursive: true })
    commit('remove greet')
    expect(run('status').output).toContain('removed from ras-stack')
  })

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
