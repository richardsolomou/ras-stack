import crypto from 'node:crypto'

export function randomToken(bytes = 16) {
  if (!Number.isSafeInteger(bytes) || bytes < 1) throw new RangeError('Token bytes must be a positive integer')
  return crypto.randomBytes(bytes).toString('base64url')
}

export function randomId(bytes = 8) {
  return randomToken(bytes)
}
