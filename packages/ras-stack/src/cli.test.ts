import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseRasCommand, runRasCli } from './cli.js'

describe('parseRasCommand', () => {
  it.each([
    'assets',
    'changesets',
    'preview',
    'realtime',
    'install',
    'prepare',
    'typecheck',
    'lint',
    'format',
    'dev',
    'build',
    'test',
    'e2e',
    'exec',
    'audit',
  ] as const)('routes the %s command', (command) => {
    expect(parseRasCommand([command, 'argument'])).toEqual({ command, arguments: ['argument'] })
  })

  it.each(['unknown', 'toString', 'create', 'init'])('rejects the %s command', (command) => {
    expect(parseRasCommand([command])).toBeUndefined()
  })
})

describe('runRasCli', () => {
  afterEach(() => {
    process.exitCode = undefined
    vi.restoreAllMocks()
  })

  it('reports usage for a command it does not own', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await runRasCli(['deploy'])

    expect(error).toHaveBeenCalledWith(
      'usage: ras <install|prepare|typecheck|lint|format|dev|build|test|e2e|exec|audit|assets|changesets|preview|realtime> [arguments]',
    )
    expect(process.exitCode).toBe(2)
  })

  it('forwards the remaining arguments to the selected command', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await runRasCli(['changesets', 'fleet'])

    expect(error).toHaveBeenCalledWith('usage: ras changesets check')
    expect(process.exitCode).toBe(2)
  })

  it('reports a failed command as a message instead of an uncaught error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await runRasCli(['preview', 'queued'])

    expect({ calls: error.mock.calls, exitCode: process.exitCode }).toEqual({
      calls: [['preview state must be awaiting, building, ready, failed, or deleted']],
      exitCode: 1,
    })
  })

  it('reports invalid realtime arguments instead of starting a container', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await runRasCli(['realtime', '--unknown', 'value'])

    expect({ calls: error.mock.calls, exitCode: process.exitCode }).toEqual({ calls: [[expect.any(String)]], exitCode: 1 })
  })
})
