import { ConnectionId } from 'spacetimedb'
import { createModuleTestHarness, TestAuth } from 'spacetimedb/server/test-utils'
import { describe, expect, it } from 'vitest'
import spacetime, * as module from './index'

const visitor = () => TestAuth.fromJwtPayload(JSON.stringify({ iss: 'https://spacetime.example', sub: 'visitor' }), new ConnectionId(1n))

describe('addNote', () => {
  it('stores the trimmed text as written by the caller', () => {
    const test = createModuleTestHarness(spacetime, module)
    const sender = test.withReducerTx(visitor(), (ctx) => {
      module.addNote(ctx, { text: '  hello  ' })
      return ctx.sender
    })
    expect(Array.from(test.db.note.iter()).map(({ text, author }) => ({ text, author: author.toHexString() }))).toEqual([
      { text: 'hello', author: sender.toHexString() },
    ])
  })

  it.each([
    ['empty', '   '],
    ['too long', 'x'.repeat(501)],
  ])('refuses %s text', (_name, text) => {
    const test = createModuleTestHarness(spacetime, module)
    expect(() => test.withReducerTx(visitor(), (ctx) => module.addNote(ctx, { text }))).toThrow('A note is 1 to 500 characters')
  })
})
