import path from 'node:path'
import { runnerImport, type Plugin } from 'vite'

/**
 * Writes the request middleware's `securityHeaders` to `_headers` in the client build, because Cloudflare serves
 * prerendered pages and other static assets without running the Worker. Vite's module runner loads the middleware,
 * since the config loader cannot follow its extensionless imports.
 */
export const staticHeaders: Plugin = {
  name: 'static-headers',
  applyToEnvironment: (environment) => environment.name === 'client',
  async generateBundle() {
    const file = path.resolve(this.environment.config.root, 'src/server/middleware.ts')
    const { module } = await runnerImport<typeof import('../src/server/middleware')>(file, { configFile: false, logLevel: 'silent' })
    const lines = Object.entries(module.securityHeaders).map(([name, value]) => `  ${name}: ${value}`)
    this.emitFile({ type: 'asset', fileName: '_headers', source: `/*\n${lines.join('\n')}\n` })
  },
}
