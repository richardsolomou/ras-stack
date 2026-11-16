import fs from 'node:fs/promises'
import path from 'node:path'
import { FileStore } from '@tus/file-store'
import { Server, type Upload } from '@tus/server'
import { isSameOriginRequest } from './origins'
import { acceptUpload, abandonedAfterMs, expireAfterMs, maxUploadBytes, uploadRejected } from './uploadPolicy'

export type { Upload } from '@tus/server'

export type UploadHooks = {
  /** Who is uploading, or undefined to answer 401. Uploads belong to this id, and only it may resume or cancel them. */
  owner: (request: Request) => Promise<string | undefined> | string | undefined
  /**
   * Records a finished upload, for example as a database row. It runs again when a client resumes an upload that finished
   * while this hook failed, so it must be idempotent.
   */
  complete: (owner: string, upload: Upload) => Promise<void> | void
}

export const uploadsPath = '/api/uploads'
const ownerKey = 'owner'
const cleanupIntervalMs = 60 * 60 * 1_000

export function uploadsDirectory(environment: NodeJS.ProcessEnv = process.env) {
  return path.resolve(environment.DATA_DIR?.trim() || '.data', 'uploads')
}

export function createUploads(hooks: UploadHooks, directory = uploadsDirectory()) {
  const store = new FileStore({ directory, expirationPeriodInMilliseconds: expireAfterMs })
  const owners = new WeakMap<object, string>()
  const ownerOf = (request: object) => {
    const owner = owners.get(request)
    if (owner === undefined) throw uploadRejected(401, 'unauthenticated')
    return owner
  }

  const server = new Server({
    path: uploadsPath,
    datastore: store,
    maxSize: maxUploadBytes,
    relativeLocation: true,
    // Same-origin only: no CORS headers, so other sites cannot read upload responses.
    allowedOrigins: [],
    // A finished upload belongs to the application's records; remove it through `remove`.
    disableTerminationForFinishedUploads: true,
    async onIncomingRequest(request, id) {
      if (request.method === 'POST') return
      const owner = ownerOf(request)
      const upload = await store.getUpload(id).catch(() => undefined)
      // Someone else's upload answers exactly like a missing one, so ids cannot be probed.
      if (upload?.metadata?.[ownerKey] !== owner) throw uploadRejected(404, 'upload not found')
      if (request.method === 'HEAD' && upload.offset === upload.size) await hooks.complete(owner, upload)
    },
    async onUploadCreate(request, upload) {
      const owner = ownerOf(request)
      if (upload.size === undefined) throw uploadRejected(400, 'Upload-Length is required')
      acceptUpload(upload, await storedUploads(owner))
      return { metadata: { ...upload.metadata, [ownerKey]: owner } }
    },
    async onUploadFinish(request, upload) {
      await hooks.complete(ownerOf(request), upload)
      return {}
    },
    onResponseError(_request, error) {
      const status = 'status_code' in error && typeof error.status_code === 'number' ? error.status_code : 500
      if (status < 500) return undefined
      // tus would otherwise send the raw message, which can name storage paths, and log nothing.
      console.error({ event: 'upload_failed', status, error })
      return { status_code: status, body: 'upload failed' }
    },
  })

  /** Every stored upload, after deleting `owner`'s abandoned ones, and the subset `owner` stored. */
  async function storedUploads(owner: string) {
    const all: Upload[] = []
    const ids = await store.configstore.list!()
    // Read together, since every creation on the deployment waits on this scan.
    const uploads = await Promise.all(ids.map((id) => store.getUpload(id).catch(() => undefined)))
    for (const [index, upload] of uploads.entries()) {
      if (!upload) continue
      const id = ids[index]!
      const owned = upload.metadata?.[ownerKey] === owner
      // An unfinished upload its owner has not touched for a while is abandoned, so it stops holding their quota.
      if (owned && upload.offset !== upload.size && Date.now() - (await fs.stat(upload.storage!.path)).mtimeMs > abandonedAfterMs) {
        await store.remove(id).catch(() => undefined)
      } else all.push(upload)
    }
    return { owned: all.filter((upload) => upload.metadata?.[ownerKey] === owner), all }
  }

  // Each creation counts what is stored and then adds to it, so creations run one at a time across the deployment.
  let creating: Promise<unknown> = Promise.resolve()
  function serialized(work: () => Promise<Response>) {
    const current = creating.then(work, work)
    creating = current
    return current
  }

  const removeExpired = () =>
    server.cleanUpExpiredUploads().catch((error: unknown) => console.error({ event: 'upload_cleanup_failed', error }))
  void removeExpired()
  const cleanup = setInterval(() => void removeExpired(), cleanupIntervalMs)
  cleanup.unref()

  return {
    /** Answers the tus protocol for `/api/uploads` and `/api/uploads/<id>`. */
    async handle(request: Request) {
      if (request.method !== 'HEAD' && !isSameOriginRequest(request)) return new Response('cross-origin mutation rejected', { status: 403 })
      const owner = await hooks.owner(request)
      if (owner === undefined) return new Response('unauthenticated', { status: 401 })
      owners.set(request, owner)
      return request.method === 'POST' ? serialized(() => server.handleWeb(request)) : server.handleWeb(request)
    },
    /** The stored file of a finished upload, for the application's own download route after it checks access. */
    file: async (id: string) => {
      const upload = await store.getUpload(id)
      if (upload.offset !== upload.size) throw new Error(`upload ${id} is not finished`)
      return upload.storage!.path
    },
    /** Deletes an upload's file and metadata, such as when the application deletes its record. */
    remove: (id: string) => store.remove(id),
    close: () => clearInterval(cleanup),
  }
}
