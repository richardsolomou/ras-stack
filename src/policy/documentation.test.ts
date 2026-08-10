import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { adoptionSnapshotDrift } from './index.js'

describe('published documentation', () => {
  it('does not recommend ras-stack releases older than the fleet baseline', async () => {
    const [readme, fleetSource] = await Promise.all([
      readFile(new URL('../../README.md', import.meta.url), 'utf8'),
      readFile(new URL('../../ras-stack.fleet.json', import.meta.url), 'utf8'),
    ])
    const fleet = JSON.parse(fleetSource) as {
      repositories: Array<{ repository: string; adoption: { minimumRasStackVersion?: string } }>
    }
    const minimum = fleet.repositories.find(({ repository }) => repository === 'richardsolomou/ras-stack')?.adoption.minimumRasStackVersion
    expect(minimum).toBeDefined()

    const references = [...readme.matchAll(/richardsolomou\/ras-stack\/[^\s'"}]+@v(\d+\.\d+\.\d+)/g)].map(([, version]) => version)
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
        { minimumWorkflowRasStackVersion: minimum! },
      ),
    ).toEqual([])
  })
})
