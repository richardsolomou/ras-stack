import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { runProcess } from './process.js'

describe('managed child processes', () => {
  it('reports an executable that cannot be started', async () => {
    await expect(runProcess('ras-executable-does-not-exist', [], tmpdir())).rejects.toThrow('ENOENT')
  })
})
