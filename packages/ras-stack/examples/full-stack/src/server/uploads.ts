import { and, eq, lt, sql } from 'drizzle-orm'
import { appendFileSync, mkdirSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import { randomId } from 'ras-stack/auth'
import type { app } from './app'
import { uploads } from './schema'

type Database = ReturnType<typeof app>['database']
type Upload = typeof uploads.$inferSelect

export class UploadStore {
  private readonly locks = new Map<string, Promise<void>>()
  private cleanupTimer?: NodeJS.Timeout

  constructor(
    private readonly options: {
      database: Database
      directory: string
      maxBytes: number
      quotaBytes: number
      globalQuotaBytes: number
      globalMaxFiles: number
      onError?: (error: unknown) => void
    },
  ) {
    mkdirSync(options.directory, { recursive: true })
  }

  create(ownerId: string, length: number, metadataHeader: string | null) {
    if (!Number.isSafeInteger(length) || length < 1 || length > this.options.maxBytes) {
      throw new Response('Invalid upload length', { status: 400 })
    }
    const metadata = parseMetadata(metadataHeader)
    const id = randomId()
    const now = new Date()
    let fileCreated = false
    try {
      return this.options.database.transaction(
        (transaction) => {
          const { count, bytes } = transaction
            .select({ count: sql<number>`count(*)`, bytes: sql<number>`coalesce(sum(${uploads.length}), 0)` })
            .from(uploads)
            .where(eq(uploads.ownerId, ownerId))
            .get() ?? { count: 0, bytes: 0 }
          if (count >= 32) throw new Response('Too many uploads', { status: 429 })
          if (bytes + length > this.options.quotaBytes) throw new Response('Upload quota exceeded', { status: 413 })
          const global = transaction
            .select({ count: sql<number>`count(*)`, bytes: sql<number>`coalesce(sum(${uploads.length}), 0)` })
            .from(uploads)
            .get() ?? { count: 0, bytes: 0 }
          if (global.count >= this.options.globalMaxFiles || global.bytes + length > this.options.globalQuotaBytes) {
            throw new Response('Deployment upload storage limit reached', { status: 507 })
          }
          appendFileSync(this.file(id), new Uint8Array(), { flag: 'wx' })
          fileCreated = true
          transaction
            .insert(uploads)
            .values({
              id,
              ownerId,
              filename: metadata.filename,
              mediaType: metadata.mediaType,
              length,
              offset: 0,
              state: 'active',
              createdAt: now,
              updatedAt: now,
            })
            .run()
          return id
        },
        { behavior: 'immediate' },
      )
    } catch (error) {
      if (fileCreated) {
        try {
          rmSync(this.file(id), { force: true })
        } catch (cleanupError) {
          const failure = new AggregateError([error, cleanupError], 'Upload metadata failed and empty-file cleanup was incomplete')
          failure.cause = error
          throw failure
        }
      }
      throw error
    }
  }

  getOwned(id: string, ownerId: string) {
    const upload = this.options.database
      .select()
      .from(uploads)
      .where(and(eq(uploads.id, id), eq(uploads.ownerId, ownerId)))
      .get()
    if (!upload) return undefined
    return this.reconcile(upload)
  }

  append(id: string, ownerId: string, expectedOffset: number, chunk: Uint8Array) {
    const previous = this.locks.get(id) ?? Promise.resolve()
    const running = previous.catch(() => undefined).then(() => this.appendUnlocked(id, ownerId, expectedOffset, chunk))
    const stored = running.then(
      () => undefined,
      () => undefined,
    )
    this.locks.set(id, stored)
    void stored.finally(() => {
      if (this.locks.get(id) === stored) this.locks.delete(id)
    })
    return running
  }

  startCleanup(intervalMs = 60 * 60 * 1_000) {
    if (this.cleanupTimer) return
    this.runScheduledCleanup()
    this.cleanupTimer = setInterval(() => this.runScheduledCleanup(), intervalMs)
    this.cleanupTimer.unref()
  }

  async close() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer)
    this.cleanupTimer = undefined
    await Promise.all(this.locks.values())
  }

  cleanupStale(now = new Date(), maxAgeMs = 24 * 60 * 60 * 1_000) {
    const stale = this.options.database
      .select({ id: uploads.id })
      .from(uploads)
      .where(and(eq(uploads.state, 'active'), lt(uploads.updatedAt, new Date(now.getTime() - maxAgeMs))))
      .limit(100)
      .all()
    for (const { id } of stale) {
      rmSync(this.file(id), { force: true })
      this.options.database.delete(uploads).where(eq(uploads.id, id)).run()
    }
    return stale.length
  }

  private appendUnlocked(id: string, ownerId: string, expectedOffset: number, chunk: Uint8Array) {
    const upload = this.getOwned(id, ownerId)
    if (!upload) throw new Response('Upload not found', { status: 404 })
    if (upload.state !== 'active') throw new Response('Upload is complete', { status: 409 })
    if (expectedOffset !== upload.offset) throw new Response('Upload offset conflict', { status: 409 })
    if (chunk.length < 1 || upload.offset + chunk.length > upload.length) throw new Response('Invalid upload chunk', { status: 413 })
    appendFileSync(this.file(id), chunk)
    const offset = upload.offset + chunk.length
    const state = offset === upload.length ? 'complete' : 'active'
    this.options.database.update(uploads).set({ offset, state, updatedAt: new Date() }).where(eq(uploads.id, id)).run()
    return { ...upload, offset, state } satisfies Upload
  }

  private runScheduledCleanup() {
    try {
      this.cleanupStale()
    } catch (error) {
      if (this.options.onError) this.options.onError(error)
      else console.error({ event: 'example_upload_cleanup_failed', error })
    }
  }

  private reconcile(upload: Upload) {
    const size = statSync(this.file(upload.id)).size
    if (size > upload.length) throw new Error(`Upload ${upload.id} exceeds its declared length`)
    if (size === upload.offset) return upload
    const state = size === upload.length ? 'complete' : 'active'
    this.options.database.update(uploads).set({ offset: size, state, updatedAt: new Date() }).where(eq(uploads.id, upload.id)).run()
    return { ...upload, offset: size, state } satisfies Upload
  }

  private file(id: string) {
    return path.join(this.options.directory, `${id}.bin`)
  }
}

function parseMetadata(header: string | null) {
  if (!header || header.length > 2_048) throw new Response('Upload metadata is required', { status: 400 })
  const values = new Map<string, string>()
  for (const item of header.split(',')) {
    const [key, encoded, extra] = item.trim().split(' ')
    if (!key || !encoded || extra || values.has(key)) throw new Response('Invalid upload metadata', { status: 400 })
    let value: string
    try {
      const decoded = Buffer.from(encoded, 'base64')
      if (decoded.toString('base64') !== encoded) throw new Error('Non-canonical base64')
      value = new TextDecoder('utf-8', { fatal: true }).decode(decoded)
    } catch {
      throw new Response('Invalid upload metadata', { status: 400 })
    }
    values.set(key, value)
  }
  const filename = values.get('filename')?.trim() ?? ''
  const mediaType = values.get('filetype')?.trim() || 'application/octet-stream'
  const hasControlCharacter = filename.split('').some((character) => character.charCodeAt(0) < 32)
  if (!filename || filename.length > 120 || path.basename(filename) !== filename || hasControlCharacter) {
    throw new Response('Invalid filename', { status: 400 })
  }
  if (mediaType !== 'text/plain') throw new Response('Only text files are accepted', { status: 415 })
  return { filename, mediaType }
}
