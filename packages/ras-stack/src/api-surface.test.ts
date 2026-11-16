import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import * as previewDokploy from './preview/dokploy.js'

// Widening the published surface is a semantic-version commitment, so it has to arrive as a reviewed diff here.
const surface = {
  './preview/dokploy': ['DokployClient', 'dokployPreviewFromEnvironment', 'loadPreviewAppSecrets', 'pullRequestNumber'],
} satisfies Record<string, string[]>

describe('published API surface', () => {
  it('exports exactly the recorded names', () => {
    expect({ './preview/dokploy': Object.keys(previewDokploy).toSorted() }).toEqual(surface)
  })

  it('records every entrypoint the package publishes', async () => {
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { exports: Record<string, unknown> }
    expect(Object.keys(manifest.exports)).toEqual(Object.keys(surface))
  })
})
