import { readdir, readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('shared workflow dependencies', () => {
  it('uses one ras-stack release for published actions', async () => {
    const directory = new URL('../../../../.github/workflows/', import.meta.url)
    const files = await readdir(directory)
    const sources = await Promise.all(
      files.filter((file) => file.endsWith('.yml')).map((file) => readFile(new URL(file, directory), 'utf8')),
    )
    const versions = sources.flatMap((source) =>
      [...source.matchAll(/uses:\s+richardsolomou\/ras-stack\/actions\/[^\s@]+@(v\d+\.\d+\.\d+)/g)].map((match) => match[1]),
    )

    expect(new Set(versions).size).toBe(1)
  })
})
