import { spacetimeConnectSources } from './spacetimeOrigin'

/**
 * The Content Security Policy's sources by directive, which `middleware.ts` turns into the header. Add the sources the
 * application's own features load from here, so recipe updates to the middleware never conflict with them.
 */
export const contentSecurityPolicy: Record<string, string[]> = {
  'default-src': ["'self'"],
  // Start streams its hydration data as inline scripts, and the root route adds chunk recovery. SpacetimeDB's client SDK
  // compiles its binary codecs with `Function()`, so it needs `'unsafe-eval'`.
  'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:'],
  'font-src': ["'self'", 'data:'],
  'connect-src': ["'self'", ...spacetimeConnectSources(import.meta.env.VITE_SPACETIME_URL)],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'none'"],
}
