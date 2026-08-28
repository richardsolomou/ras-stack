import crypto from 'node:crypto'

export type RealtimeTokenOptions = {
  secret: string
  now?: number
  ttlSeconds?: number
}

export function signRealtimeToken(subject: string, claims: Record<string, unknown>, options: RealtimeTokenOptions) {
  const now = options.now ?? Math.floor(Date.now() / 1000)
  return sign({ ...claims, sub: subject, exp: now + (options.ttlSeconds ?? 5 * 60) }, options.secret)
}

function sign(payload: Record<string, unknown>, secret: string) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const claims = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const unsigned = `${header}.${claims}`
  const signature = crypto.createHmac('sha256', secret).update(unsigned).digest('base64url')
  return `${unsigned}.${signature}`
}
