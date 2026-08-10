import { createStart } from '@tanstack/react-start'
import { canonicalHostMiddleware } from 'ras-stack/tanstack/server'

const canonicalHost = canonicalHostMiddleware(() => ({
  canonicalUrl: process.env.APP_URL,
  pathsServedOnAnyHost: new Set(['/api/health', '/api/centrifugo/connect']),
}))

export const startInstance = createStart(() => ({ requestMiddleware: [canonicalHost] }))
