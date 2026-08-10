import { readdir, readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('published documentation', () => {
  it('uses one ras-stack release across public examples', async () => {
    const documentationDirectory = new URL('../../docs/', import.meta.url)
    const documentationFiles = (await readdir(documentationDirectory)).filter((file) => file.endsWith('.md'))
    const documentation = await Promise.all([
      readFile(new URL('../../README.md', import.meta.url), 'utf8'),
      ...documentationFiles.map((file) => readFile(new URL(file, documentationDirectory), 'utf8')),
    ])

    const references = [...documentation.join('\n').matchAll(/richardsolomou\/ras-stack\/[^\s'"}]+@v(\d+\.\d+\.\d+)/g)].map(
      ([, version]) => version,
    )
    expect(references.length).toBeGreaterThan(0)
    expect(new Set(references).size).toBe(1)
  })
})
