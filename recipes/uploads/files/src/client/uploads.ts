import { Upload } from 'tus-js-client'

export type UploadProgress = { sent: number; total: number; percent: number }

export type UploadFileOptions = {
  /** Sent to the server as tus metadata; `acceptUpload` requires `filename`. */
  metadata?: Record<string, string>
  onProgress?: (progress: UploadProgress) => void
  /** Aborting cancels the upload and deletes it on the server, so it stops counting against the owner's limits. */
  signal?: AbortSignal
}

// Proxies in front of the app, such as Cloudflare's, cap request bodies at 100 MB, and a smaller chunk loses less on a retry.
const chunkSize = 32 * 1024 * 1024

/**
 * Uploads `file` to `/api/uploads`, resuming an earlier interrupted upload of the same file. Resolves with the upload's URL,
 * whose last segment is its id; rejects with an `AbortError` when `signal` aborts, or with tus-js-client's error, whose
 * `originalResponse` carries the server's status and message.
 */
export async function uploadFile(file: File, { metadata = {}, onProgress, signal }: UploadFileOptions = {}) {
  if (signal?.aborted) throw abortError()
  const upload = new Upload(file, {
    endpoint: '/api/uploads',
    metadata: { filename: file.name, filetype: file.type, ...metadata },
    chunkSize,
    retryDelays: [0, 1_000, 3_000, 5_000],
    removeFingerprintOnSuccess: true,
    onProgress: (sent, total) => onProgress?.({ sent, total, percent: total ? Math.round((sent / total) * 100) : 0 }),
  })

  let rejectAbort!: (reason: unknown) => void
  const aborted = new Promise<never>((_resolve, reject) => (rejectAbort = reject))
  const abort = () => {
    rejectAbort(abortError())
    // Deleting on the server is best effort; the caller has already been told the upload is cancelled.
    void upload.abort(true).catch(() => undefined)
  }
  signal?.addEventListener('abort', abort, { once: true })

  const run = async () => {
    const [previous] = await upload.findPreviousUploads()
    if (signal?.aborted) throw abortError()
    if (previous) upload.resumeFromPreviousUpload(previous)
    return new Promise<string>((resolve, reject) => {
      upload.options.onError = reject
      upload.options.onSuccess = () => resolve(upload.url!)
      upload.start()
    })
  }

  try {
    return await Promise.race([run(), aborted])
  } finally {
    signal?.removeEventListener('abort', abort)
  }
}

function abortError() {
  return new DOMException('Upload cancelled', 'AbortError')
}
