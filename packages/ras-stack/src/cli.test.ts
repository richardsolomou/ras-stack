import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseRasCommand, runRasCli } from './cli.js'

describe('parseRasCommand', () => {
  it.each(['assets', 'changesets', 'preview', 'realtime'] as const)('routes the %s command', (command) => {
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

    expect(error).toHaveBeenCalledWith('usage: ras <assets|changesets|preview|realtime> [arguments]')
    expect(process.exitCode).toBe(2)
  })

  it('forwards the remaining arguments to the selected command', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await runRasCli(['changesets', 'fleet'])

    expect(error).toHaveBeenCalledWith('usage: ras changesets check')
    expect(process.exitCode).toBe(2)
  })
})
