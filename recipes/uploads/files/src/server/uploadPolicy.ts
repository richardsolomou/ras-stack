import path from 'node:path'
import type { Upload } from '@tus/server'

// Application policy: change these limits and checks to fit what the application stores.

export const maxUploadBytes = 100 * 1024 * 1024
export const maxOwnerBytes = 1024 * 1024 * 1024
export const maxOwnerFiles = 500
export const maxUnfinishedPerOwner = 3
/** Uploads share the data volume with the database, so the whole deployment has a ceiling too. */
export const maxTotalBytes = 10 * 1024 * 1024 * 1024
/** Also bounds the records each creation reads to count what is stored. */
export const maxTotalFiles = 2_000
/** Unfinished uploads are deleted this long after they started, whatever their progress. */
export const expireAfterMs = 24 * 60 * 60 * 1_000
/** An unfinished upload untouched for this long stops counting against its owner and is deleted when they upload again. */
export const abandonedAfterMs = 15 * 60 * 1_000

/** A refusal tus sends to the client as is: `status` and `message` reach the browser, unlike unexpected errors. */
export function uploadRejected(status: number, message: string) {
  return Object.assign(new Error(message), { status_code: status, body: message })
}

/**
 * Throws `uploadRejected` to refuse a new upload before any of it is stored. `owned` and `all` are everything the owner and
 * the whole deployment have stored, finished or not, so the limits hold for files on disk; a database-backed application can
 * count its own records instead.
 */
export function acceptUpload(upload: Upload, { owned, all }: { owned: Upload[]; all: Upload[] }) {
  const filename = upload.metadata?.filename?.trim() ?? ''
  if (!filename || filename.length > 255 || path.basename(filename) !== filename || /[\p{Cc}]/u.test(filename)) {
    throw uploadRejected(400, 'invalid filename')
  }
  if (owned.filter((stored) => stored.offset !== stored.size).length >= maxUnfinishedPerOwner) {
    throw uploadRejected(429, 'too many unfinished uploads')
  }
  // Counting files as well as bytes keeps empty files from slipping past the byte limits.
  if (owned.length >= maxOwnerFiles || bytes(owned) + (upload.size ?? 0) > maxOwnerBytes) {
    throw uploadRejected(413, 'upload quota exceeded')
  }
  if (all.length >= maxTotalFiles || bytes(all) + (upload.size ?? 0) > maxTotalBytes) {
    throw uploadRejected(507, 'upload storage is full')
  }
}

const bytes = (uploads: Upload[]) => uploads.reduce((total, { size }) => total + (size ?? 0), 0)
