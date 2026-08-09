import { beforeEach, describe, expect, it, vi } from 'vitest'

type MockOptions = {
  onError?: (error: Error) => void
  onSuccess?: (event: { lastResponse: { getBody(): string; getStatus(): number } }) => void
  onProgress?: (sent: number, total: number) => void
  onShouldRetry?: (error: { originalResponse?: { getStatus(): number } }, attempt: number, options: unknown) => boolean
  [key: string]: unknown
}

type MockUpload = {
  options: MockOptions
  resumeFromPreviousUpload: ReturnType<typeof vi.fn>
}

const mocks = vi.hoisted(() => ({ instances: [] as MockUpload[], retry: vi.fn(() => true) }))

vi.mock('tus-js-client', () => ({
  defaultOptions: { onShouldRetry: mocks.retry },
  Upload: class {
    options: MockOptions
    url: string | null = 'https://uploads.example.com/one'
    findPreviousUploads = vi.fn(async () => [{ uploadUrl: 'previous' }])
    resumeFromPreviousUpload = vi.fn()

    constructor(
      public file: File,
      options: MockOptions,
    ) {
      this.options = options
      mocks.instances.push(this)
    }

    start() {
      if (this.file.name === 'fail.bin') this.options.onError?.(new Error('upload failed'))
      else this.options.onSuccess?.({ lastResponse: { getBody: () => '{"id":"asset-1"}', getStatus: () => 200 } })
    }
  },
}))

import { createTusUpload, startTusUpload, tusResponse, tusResponseMessage, uploadWithTus } from './index.js'

beforeEach(() => {
  mocks.instances.length = 0
  mocks.retry.mockClear()
})

describe('tus uploads', () => {
  it('resumes a previous upload and returns the server response', async () => {
    const progress = vi.fn()
    const result = await uploadWithTus({
      endpoint: '/api/upload',
      file: new File(['data'], 'asset.bin'),
      metadata: { kind: 'asset' },
      onProgress: progress,
    })
    const upload = mocks.instances[0]!
    expect(upload.resumeFromPreviousUpload).toHaveBeenCalledWith({ uploadUrl: 'previous' })
    expect(result).toEqual({ responseBody: '{"id":"asset-1"}', responseStatus: 200, uploadUrl: 'https://uploads.example.com/one' })
    upload.options.onProgress?.(5, 20)
    expect(progress).toHaveBeenCalledWith({ sent: 5, total: 20, percent: 25 })
  })

  it('lets applications block retries for meaningful statuses', async () => {
    const shouldRetry = vi.fn(() => false)
    await uploadWithTus({ endpoint: '/api/upload', file: new File([], 'asset.bin'), metadata: {}, shouldRetry })
    const upload = mocks.instances[0]!
    const error = { originalResponse: { getStatus: () => 423 } }
    expect(upload.options.onShouldRetry?.(error, 2, {})).toBe(false)
    expect(shouldRetry).toHaveBeenCalledWith(423, 2)
    expect(mocks.retry).not.toHaveBeenCalled()
  })

  it('exposes the upstream upload before starting it', async () => {
    const upload = createTusUpload({ endpoint: '/api/upload', file: new File([], 'asset.bin'), metadata: {} })
    expect(upload).toBe(mocks.instances[0])
    await startTusUpload(upload, false)
    expect(mocks.instances[0]!.resumeFromPreviousUpload).not.toHaveBeenCalled()
  })

  it('preserves callbacks added through the upstream upload', async () => {
    const success = vi.fn()
    const upload = createTusUpload({ endpoint: '/api/upload', file: new File([], 'asset.bin'), metadata: {} })
    upload.options.onSuccess = success
    await startTusUpload(upload)
    expect(success).toHaveBeenCalledOnce()
  })

  it('rejects with the upload error after running the upstream error callback', async () => {
    const upstream = vi.fn(() => {
      throw new Error('callback failed')
    })
    const upload = createTusUpload({ endpoint: '/api/upload', file: new File([], 'fail.bin'), metadata: {} })
    upload.options.onError = upstream
    await expect(startTusUpload(upload)).rejects.toThrow('upload failed')
    expect(upstream).toHaveBeenCalledOnce()
  })
})

describe('tus errors', () => {
  it('reads a structured response from a tus error', () => {
    const error = { originalResponse: { getStatus: () => 413, getBody: () => 'storage full' } }
    expect(tusResponse(error)).toEqual({ status: 413, body: 'storage full' })
    expect(tusResponseMessage(error)).toBe('storage full')
  })

  it('falls back to the response text embedded by tus', () => {
    expect(tusResponseMessage(new Error('request failed, response text: not allowed, request id: one'))).toBe('not allowed')
  })
})
