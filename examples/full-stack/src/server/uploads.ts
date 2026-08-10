import { globalSingleton } from 'ras-stack/server'
import { randomId } from 'ras-stack/auth'

type Upload = { bytes: Uint8Array; length: number }
const MAX_UPLOADS = 32

export const uploads = () => globalSingleton('ras-stack.example.uploads', () => new Map<string, Upload>())

export function createUpload(length: number) {
  if (!Number.isSafeInteger(length) || length < 1 || length > 1_000_000) throw new Response('Invalid upload length', { status: 400 })
  if (uploads().size >= MAX_UPLOADS) throw new Response('Too many active uploads', { status: 503 })
  const id = randomId()
  uploads().set(id, { bytes: new Uint8Array(), length })
  return id
}
