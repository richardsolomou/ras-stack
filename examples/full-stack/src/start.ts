import { createStart } from '@tanstack/react-start'
import { canonicalHostMiddleware } from 'ras-stack/tanstack/middleware'

// The Centrifugo connect proxy is deliberately absent from this set: it calls in over the loopback interface,
// which canonicalRedirect leaves alone. Listing it here would hide a regression in that behaviour from the
// end-to-end run, which exercises a real Centrifugo against a real container.
const canonicalHost = canonicalHostMiddleware(() => ({
  canonicalUrl: process.env.APP_URL,
  pathsServedOnAnyHost: new Set(['/api/health']),
}))

export const startInstance = createStart(() => ({ requestMiddleware: [canonicalHost] }))
