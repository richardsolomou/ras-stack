import { getRequest } from '@tanstack/react-start/server'
import crypto from 'node:crypto'
import { app } from './app'

const COOKIE = 'ras_stack_example_session'
const SESSION_TTL_MS = 60 * 60 * 1000

export function sessionCookie(name: string, now = Date.now()) {
  const value = Buffer.from(JSON.stringify({ name, issuedAt: now })).toString('base64url')
  const signature = crypto.createHmac('sha256', app().authSecret).update(value).digest('base64url')
  return { name: COOKIE, value: `${value}.${signature}` }
}

export function currentUser(request = getRequest(), now = Date.now()) {
  const encoded = cookie(request.headers.get('cookie'), COOKIE)
  if (!encoded) return undefined
  const [value, signature] = encoded.split('.')
  if (!value || !signature) return undefined
  const expected = crypto.createHmac('sha256', app().authSecret).update(value).digest()
  const received = Buffer.from(signature, 'base64url')
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return undefined
  const session = parseSession(value)
  if (!session || session.issuedAt > now || now - session.issuedAt > SESSION_TTL_MS) return undefined
  return { id: crypto.createHash('sha256').update(session.name).digest('hex').slice(0, 16), name: session.name }
}

export function requireCurrentUser(request: Request) {
  const user = currentUser(request)
  if (!user) throw new Response('Sign in first', { status: 401 })
  return user
}

function parseSession(value: string) {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString())
    if (!parsed || typeof parsed !== 'object' || !('name' in parsed) || !('issuedAt' in parsed)) return undefined
    const name = typeof parsed.name === 'string' ? parsed.name.trim() : ''
    return name && Number.isSafeInteger(parsed.issuedAt) ? { name, issuedAt: parsed.issuedAt as number } : undefined
  } catch {
    return undefined
  }
}

function cookie(header: string | null, name: string) {
  return header
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1)
}
