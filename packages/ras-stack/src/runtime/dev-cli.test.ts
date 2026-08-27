import { afterEach, describe, expect, it, vi } from 'vitest'
import { runRealtimeCli } from './dev-cli.js'

describe('realtime development CLI', () => {
  afterEach(() => {
    process.exitCode = undefined
    vi.restoreAllMocks()
  })

  it.each([
    { arguments_: ['--unknown', 'value'], message: 'unknown argument: --unknown' },
    { arguments_: ['--config'], message: '--config requires a value' },
    { arguments_: ['--config', 'realtime.json'], message: '--name is required' },
  ])('reports $message instead of starting a container', async ({ arguments_, message }) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await runRealtimeCli(arguments_)

    expect(error).toHaveBeenCalledWith(message)
    expect(process.exitCode).toBe(1)
  })
})
