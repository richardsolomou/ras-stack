import { clearGlobalSingleton } from 'ras-stack/server'
import { afterEach, describe, expect, it } from 'vitest'
import { createUpload, uploads } from './uploads'

afterEach(() => clearGlobalSingleton('ras-stack.example.uploads'))

describe('example uploads', () => {
  it('creates a bounded empty upload', () => {
    const id = createUpload(12)
    expect(uploads().get(id)).toEqual({ bytes: new Uint8Array(), length: 12 })
  })

  it('rejects uploads larger than one megabyte', async () => {
    let failure: unknown
    try {
      createUpload(1_000_001)
    } catch (error) {
      failure = error
    }
    expect(failure).toEqual(new Response('Invalid upload length', { status: 400 }))
  })

  it('bounds concurrent uploads', () => {
    for (let index = 0; index < 32; index++) createUpload(1)
    let failure: unknown
    try {
      createUpload(1)
    } catch (error) {
      failure = error
    }
    expect(failure).toEqual(new Response('Too many active uploads', { status: 503 }))
  })
})
