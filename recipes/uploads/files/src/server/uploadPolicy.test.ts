import { Upload } from '@tus/server'
import { describe, expect, it } from 'vitest'
import { acceptUpload, maxOwnerFiles, maxTotalBytes, maxTotalFiles } from './uploadPolicy'

const upload = (size: number, offset = size) => new Upload({ id: crypto.randomUUID(), size, offset, metadata: { filename: 'notes.txt' } })
const refusal = (work: () => void) => {
  try {
    work()
  } catch (error) {
    return (error as { status_code: number }).status_code
  }
  return undefined
}

describe('acceptUpload', () => {
  it('counts empty files against the owner', () => {
    const owned = Array.from({ length: maxOwnerFiles }, () => upload(0))
    expect(refusal(() => acceptUpload(upload(0), { owned, all: owned }))).toBe(413)
  })

  it('refuses once the deployment holds its most files', () => {
    const all = Array.from({ length: maxTotalFiles }, () => upload(1))
    expect(refusal(() => acceptUpload(upload(1), { owned: [], all }))).toBe(507)
  })

  it('refuses once the deployment would exceed its most bytes', () => {
    expect(refusal(() => acceptUpload(upload(2), { owned: [], all: [upload(maxTotalBytes - 1)] }))).toBe(507)
  })

  it('accepts an upload within every limit', () => {
    expect(refusal(() => acceptUpload(upload(1), { owned: [upload(1)], all: [upload(1), upload(1)] }))).toBeUndefined()
  })
})
