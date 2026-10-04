import { readdir, readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('shared workflow dependencies', () => {
  it('resolves ras-stack actions and workflows through the stable compatibility tag', async () => {
    const directory = new URL('../../../../.github/workflows/', import.meta.url)
    const files = await readdir(directory)
    const sources = await Promise.all(
      files.filter((file) => file.endsWith('.yml')).map((file) => readFile(new URL(file, directory), 'utf8')),
    )
    const stableSelfReferences = sources.flatMap((source) => source.match(/uses:\s+richardsolomou\/ras-stack\/[^\s]+@v[12]/g) ?? [])
    const invalidSelfReferences = sources.flatMap((source) => source.match(/uses:\s+\$\//g) ?? [])

    expect(invalidSelfReferences).toEqual([])
    expect(stableSelfReferences.length).toBeGreaterThan(0)
  })

  it('keeps every stable self-reference on an existing workflow or action', async () => {
    const root = new URL('../../../../', import.meta.url)
    const directory = new URL('.github/workflows/', root)
    const files = await readdir(directory)
    const sources = await Promise.all(
      files.filter((file) => file.endsWith('.yml')).map((file) => readFile(new URL(file, directory), 'utf8')),
    )
    const references = sources.flatMap((source) =>
      [...source.matchAll(/uses:\s+richardsolomou\/ras-stack\/([^\s@]+)@v[12]/g)].map((match) => match[1]!),
    )

    await expect(
      Promise.all(
        references.map((reference) => readFile(new URL(reference.endsWith('.yml') ? reference : `${reference}/action.yml`, root))),
      ),
    ).resolves.toHaveLength(references.length)
  })
})
