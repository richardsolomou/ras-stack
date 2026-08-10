import { afterEach, describe, expect, it, vi } from 'vitest'
import { runPolicyCli } from './cli.js'

describe('policy CLI', () => {
  afterEach(() => {
    process.exitCode = undefined
    vi.restoreAllMocks()
  })

  it('rejects the removed fleet command', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await runPolicyCli(['fleet'])

    expect(error).toHaveBeenCalledWith('usage: ras policy <check|sync> [adoption]')
    expect(process.exitCode).toBe(2)
  })
})
