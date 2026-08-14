import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseRasCommand, runRasCli } from './cli.js'

describe('parseRasCommand', () => {
  it.each(['assets', 'policy', 'preview', 'realtime'] as const)('routes the %s command', (command) => {
    expect(parseRasCommand([command, 'argument'])).toEqual({ command, arguments: ['argument'] })
  })

  it.each(['unknown', 'toString'])('rejects the %s command', (command) => {
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

    expect(error).toHaveBeenCalledWith('usage: ras <assets|policy|preview|realtime> [arguments]')
    expect(process.exitCode).toBe(2)
  })

  it('forwards the remaining arguments to the selected command', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await runRasCli(['policy', 'fleet'])

    expect(error).toHaveBeenCalledWith('usage: ras policy <check|sync> [adoption]')
    expect(process.exitCode).toBe(2)
  })
})
