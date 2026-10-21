import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { runProcess } from './process.js'

describe('managed child processes', () => {
  it('reports an executable that cannot be started', async () => {
    await expect(runProcess('ras-executable-does-not-exist', [], tmpdir())).rejects.toThrow('ENOENT')
  })

  it('waits for a cancelled child to stop', async () => {
    await expect(
      runProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], tmpdir(), { signal: AbortSignal.timeout(50) }),
    ).rejects.toThrow('aborted')
  })
})
