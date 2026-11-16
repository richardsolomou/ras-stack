import { afterEach, describe, expect, it, vi } from 'vitest'
import { runRasCli } from './cli.js'

describe('runRasCli', () => {
  afterEach(() => {
    process.exitCode = undefined
    vi.restoreAllMocks()
  })

  it.each([[[]], [['sync']], [['assets', 'check']]])('reports usage for %j', async (arguments_) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await runRasCli(arguments_)

    expect({ calls: error.mock.calls, exitCode: process.exitCode }).toEqual({
      calls: [['usage: ras preview <state|dokploy> [arguments]']],
      exitCode: 2,
    })
  })

  it('reports a failed preview command as a message instead of an uncaught error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await runRasCli(['preview', 'queued'])

    expect({ calls: error.mock.calls, exitCode: process.exitCode }).toEqual({
      calls: [['preview state must be awaiting, building, ready, failed, or deleted']],
      exitCode: 1,
    })
  })
})
