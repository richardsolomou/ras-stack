import { readdir, readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('published documentation', () => {
  it('documents every entrypoint the package publishes', async () => {
    const [manifestSource, ...documentation] = await Promise.all([
      readFile(new URL('../../package.json', import.meta.url), 'utf8'),
      ...(await documentationSources()),
    ])
    const { exports } = JSON.parse(manifestSource) as { exports: Record<string, unknown> }
    const published = Object.keys(exports).filter((path) => !path.startsWith('./config/'))
    const prose = documentation.join('\n')

    expect(published.filter((path) => !prose.includes(`ras-stack/${path.slice(2)}`))).toEqual([])
  })
})

async function documentationSources() {
  const directory = new URL('../../docs/', import.meta.url)
  const files = (await readdir(directory)).filter((file) => file.endsWith('.md'))
  return [readFile(new URL('../../README.md', import.meta.url), 'utf8'), ...files.map((file) => readFile(new URL(file, directory), 'utf8'))]
}
