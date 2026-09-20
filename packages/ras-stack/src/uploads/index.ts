import { defaultOptions, Upload, type UploadOptions } from 'tus-js-client'

export type TusUploadProgress = { sent: number; total: number; percent: number }

export type TusUploadOptions = {
  endpoint: string
  file: File
  metadata: Record<string, string>
  chunkSize?: number
  retryDelays?: readonly number[]
  fingerprint?: UploadOptions['fingerprint']
  removeFingerprintOnSuccess?: boolean
  shouldRetry?: (status: number | undefined, retryAttempt: number) => boolean
  onProgress?: (progress: TusUploadProgress) => void
}

export type TusUploadResult = {
  responseBody: string
  responseStatus: number | undefined
  uploadUrl: string | null
}

export type TusUploadStartOptions = {
  resume?: boolean
  signal?: AbortSignal
  terminateOnAbort?: boolean
}

export function createTusUpload(options: TusUploadOptions) {
  return new Upload(options.file, {
    endpoint: options.endpoint,
    metadata: options.metadata,
    retryDelays: [...(options.retryDelays ?? [0, 1_000, 3_000, 5_000])],
    ...(options.chunkSize === undefined ? {} : { chunkSize: options.chunkSize }),
    ...(options.fingerprint === undefined ? {} : { fingerprint: options.fingerprint }),
    ...(options.removeFingerprintOnSuccess === undefined ? {} : { removeFingerprintOnSuccess: options.removeFingerprintOnSuccess }),
    onShouldRetry: (error, retryAttempt, uploadOptions) => {
      const status = error.originalResponse?.getStatus()
      if (options.shouldRetry && !options.shouldRetry(status, retryAttempt)) return false
      return defaultOptions.onShouldRetry?.(error, retryAttempt, uploadOptions) === true
    },
    onProgress: (sent, total) => options.onProgress?.({ sent, total, percent: total ? Math.round((sent / total) * 100) : 0 }),
  })
}

export async function startTusUpload(upload: Upload, options: boolean | TusUploadStartOptions = true): Promise<TusUploadResult> {
  const { resume = true, signal, terminateOnAbort = false } = typeof options === 'boolean' ? { resume: options } : options
  if (signal?.aborted) throw tusAbortError()
  let rejectAbort: ((reason: unknown) => void) | undefined
  const aborted = signal
    ? new Promise<never>((_resolve, reject) => {
        rejectAbort = reject
      })
    : undefined
  const abort = () => {
    rejectAbort?.(tusAbortError())
    // Remote termination is best-effort after local cancellation has settled for the caller.
    void Promise.resolve()
      .then(() => upload.abort(terminateOnAbort))
      .catch(() => undefined)
  }
  signal?.addEventListener('abort', abort, { once: true })

  const run = async () => {
    if (resume) {
      const previous = await upload.findPreviousUploads()
      if (signal?.aborted) throw tusAbortError()
      if (previous[0]) upload.resumeFromPreviousUpload(previous[0])
    }

    return new Promise<TusUploadResult>((resolve, reject) => {
      const previousError = upload.options.onError
      const previousSuccess = upload.options.onSuccess
      upload.options.onError = (error) => {
        try {
          previousError?.(error)
        } finally {
          reject(error)
        }
      }
      upload.options.onSuccess = (event) => {
        try {
          previousSuccess?.(event)
          resolve({
            responseBody: event.lastResponse.getBody(),
            responseStatus: event.lastResponse.getStatus(),
            uploadUrl: upload.url,
          })
        } catch (error) {
          reject(error)
        }
      }
      upload.start()
    })
  }

  try {
    const result = run()
    return await (aborted ? Promise.race([result, aborted]) : result)
  } finally {
    signal?.removeEventListener('abort', abort)
  }
}

export function uploadWithTus(options: TusUploadOptions, startOptions: boolean | TusUploadStartOptions = true) {
  return startTusUpload(createTusUpload(options), startOptions)
}

export function tusResponseMessage(error: unknown) {
  const response = responseFromError(error)
  if (response) return response.body
  const message = error instanceof Error ? error.message : undefined
  return message ? /response text: ([^,]+)/.exec(message)?.[1]?.trim() : undefined
}

export function tusResponse(error: unknown) {
  return responseFromError(error)
}

function responseFromError(error: unknown) {
  if (!error || typeof error !== 'object' || !('originalResponse' in error)) return undefined
  const response = error.originalResponse
  if (!response || typeof response !== 'object' || !('getStatus' in response) || !('getBody' in response)) return undefined
  if (typeof response.getStatus !== 'function' || typeof response.getBody !== 'function') return undefined
  const status: unknown = response.getStatus()
  const body: unknown = response.getBody()
  return { status: typeof status === 'number' ? status : undefined, body: typeof body === 'string' ? body : '' }
}

function tusAbortError() {
  return new DOMException('Upload cancelled', 'AbortError')
}
