import { readdir, readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { adoptionSnapshotDrift } from './index.js'

describe('published documentation', () => {
  it('does not recommend ras-stack releases older than the adoption baseline', async () => {
    const documentationDirectory = new URL('../../docs/', import.meta.url)
    const documentationFiles = (await readdir(documentationDirectory)).filter((file) => file.endsWith('.md'))
    const [policySource, ...documentation] = await Promise.all([
      readFile(new URL('../../ras-stack.policy.json', import.meta.url), 'utf8'),
      readFile(new URL('../../README.md', import.meta.url), 'utf8'),
      ...documentationFiles.map((file) => readFile(new URL(file, documentationDirectory), 'utf8')),
    ])
    const { adoption } = JSON.parse(policySource) as { adoption: { minimumRasStackVersion: string } }

    const references = [...documentation.join('\n').matchAll(/richardsolomou\/ras-stack\/[^\s'"}]+@v(\d+\.\d+\.\d+)/g)].map(
      ([, version]) => version,
    )
    expect(references.length).toBeGreaterThan(0)
    expect(
      adoptionSnapshotDrift(
        {
          manifest: {},
          files: new Map([
            [
              '.github/workflows/documentation.yml',
              references.map((version) => `uses: richardsolomou/ras-stack/actions/setup-js@v${version}`).join('\n'),
            ],
          ]),
        },
        { minimumWorkflowRasStackVersion: adoption.minimumRasStackVersion },
      ),
    ).toEqual([])
  })
})
