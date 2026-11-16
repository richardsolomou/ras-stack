import { randomBytes } from 'node:crypto'

/** A URL-safe secret token, such as an invite or share link; 16 bytes is 128 bits. */
export function randomToken(bytes = 16) {
  if (!Number.isSafeInteger(bytes) || bytes < 1) throw new RangeError('token bytes must be a positive integer')
  return randomBytes(bytes).toString('base64url')
}

/** A short URL-safe id for records whose ids are not secret. */
export function randomId() {
  return randomToken(8)
}
