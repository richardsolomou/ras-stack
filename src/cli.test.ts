import { describe, expect, it } from 'vitest'
import { parseRasCommand } from './cli.js'

describe('parseRasCommand', () => {
  it.each(['assets', 'policy', 'preview', 'realtime'] as const)('routes the %s command', (command) => {
    expect(parseRasCommand([command, 'argument'])).toEqual({ command, arguments: ['argument'] })
  })

  it.each(['unknown', 'toString'])('rejects the %s command', (command) => {
    expect(parseRasCommand([command])).toBeUndefined()
  })
})
