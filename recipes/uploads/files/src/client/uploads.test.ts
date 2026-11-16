import { beforeEach, describe, expect, it, vi } from 'vitest'
import { uploadFile } from './uploads'

type Options = {
  endpoint: string
  metadata: Record<string, string>
  onError?: (error: Error) => void
  onSuccess?: () => void
  onProgress?: (sent: number, total: number) => void
}

const mocks = vi.hoisted(() => {
  const state = { uploads: [] as InstanceType<typeof MockUpload>[], previous: [] as unknown[] }
  class MockUpload {
    url: string | null = '/api/uploads/one'
    abort = vi.fn(async (_terminate?: boolean) => undefined)
    findPreviousUploads = vi.fn(async () => state.previous)
    resumeFromPreviousUpload = vi.fn()
    start = vi.fn(() => {
      if (this.file.name === 'pending.txt') return
      if (this.file.name === 'fail.txt') this.options.onError?.(new Error('upload failed'))
      else this.options.onSuccess?.()
    })
    file: File
    options: Options

    constructor(file: File, options: Options) {
      this.file = file
      this.options = options
      state.uploads.push(this)
    }
  }
  return { MockUpload, state }
})

vi.mock('tus-js-client', () => ({ Upload: mocks.MockUpload }))

const uploads = mocks.state.uploads

beforeEach(() => {
  uploads.length = 0
  mocks.state.previous = []
})

const file = (name: string) => new File(['data'], name, { type: 'text/plain' })

describe('uploadFile', () => {
  it('resolves with the upload URL', async () => {
    await expect(uploadFile(file('notes.txt'))).resolves.toBe('/api/uploads/one')
  })

  it('sends the filename and type with the caller’s metadata', async () => {
    await uploadFile(file('notes.txt'), { metadata: { album: 'one' } })
    expect(uploads[0]!.options).toMatchObject({
      endpoint: '/api/uploads',
      metadata: { filename: 'notes.txt', filetype: 'text/plain', album: 'one' },
    })
  })

  it('resumes an earlier upload of the same file', async () => {
    mocks.state.previous = [{ uploadUrl: '/api/uploads/earlier' }]
    await uploadFile(file('notes.txt'))
    expect(uploads[0]!.resumeFromPreviousUpload).toHaveBeenCalledWith({ uploadUrl: '/api/uploads/earlier' })
  })

  it('reports progress as a percentage', async () => {
    const onProgress = vi.fn()
    await uploadFile(file('notes.txt'), { onProgress })
    uploads[0]!.options.onProgress?.(5, 20)
    expect(onProgress).toHaveBeenCalledWith({ sent: 5, total: 20, percent: 25 })
  })

  it('rejects with the upload error', async () => {
    await expect(uploadFile(file('fail.txt'))).rejects.toThrow('upload failed')
  })

  it('cancels a running upload and deletes it on the server', async () => {
    const controller = new AbortController()
    const result = uploadFile(file('pending.txt'), { signal: controller.signal })
    await vi.waitFor(() => expect(uploads[0]!.start).toHaveBeenCalled())
    controller.abort()
    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
    expect(uploads[0]!.abort).toHaveBeenCalledWith(true)
  })

  it('does not start when cancelled while looking for an earlier upload', async () => {
    const controller = new AbortController()
    const result = uploadFile(file('notes.txt'), { signal: controller.signal })
    controller.abort()
    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
    expect(uploads[0]!.start).not.toHaveBeenCalled()
  })

  it('settles a cancellation without waiting for the server', async () => {
    const controller = new AbortController()
    const result = uploadFile(file('pending.txt'), { signal: controller.signal })
    await vi.waitFor(() => expect(uploads[0]!.start).toHaveBeenCalled())
    uploads[0]!.abort.mockImplementation(() => new Promise(() => undefined))
    controller.abort()
    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
  })
})
