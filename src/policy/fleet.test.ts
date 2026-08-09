import { describe, expect, it } from 'vitest'
import { fleetConfig, fleetMarkdown, inspectFleet } from './fleet.js'

describe('fleet adoption reporting', () => {
  it('reports repository-specific drift without mutating consumers', async () => {
    const results = await inspectFleet(
      {
        repositories: [
          {
            repository: 'richardsolomou/example',
            adoption: { minimumRasStackVersion: '0.22.0', node: '>=24 <25' },
          },
        ],
      },
      async () => ({
        manifest: { devDependencies: { 'ras-stack': '0.21.0' }, engines: { node: '>=22' } },
        files: new Map(),
      }),
    )

    expect(results).toEqual([
      {
        repository: 'richardsolomou/example',
        ref: 'main',
        drift: [
          'toolchain drift: package.json engines.node must be >=24 <25',
          'ras-stack drift: package.json uses 0.21.0, minimum is 0.22.0',
        ],
      },
    ])
  })

  it('renders an inspectable healthy report', () => {
    expect(fleetMarkdown([{ repository: 'richardsolomou/example', ref: 'main', drift: [] }])).toContain(
      '1/1 repositories conform to their declared adoption policy.\n\n## ✅ richardsolomou/example@main\n\nNo drift detected.',
    )
  })

  it('rejects malformed repository identifiers', () => {
    expect(() => fleetConfig({ repositories: [{ repository: '../private', adoption: {} }] })).toThrow(
      'each fleet repository must use an owner/name identifier',
    )
  })
})
