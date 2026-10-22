import { createFileRoute } from '@tanstack/react-router'

const surfaces = [
  ['TypeScript modules', 'Auth, databases, realtime, email, uploads, PostHog, and TanStack helpers.'],
  ['Configured stack', 'Opt into compatible dependencies, build defaults, compiler presets, and shared tools.'],
  ['CLI', 'Synchronize selections, upgrade the stack, run tools, and manage assets and previews.'],
  ['GitHub Actions', 'Set up tools, run checks and browser tests, manage previews, and publish releases.'],
  ['Runtime image', 'Verified Caddy and Centrifugo binaries for production images.'],
]

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <div className="shell">
      <header>
        <a className="wordmark" href="#top" aria-label="ras-stack home">
          <span aria-hidden="true" />
          ras-stack
        </a>
        <nav aria-label="External links">
          <a href="https://github.com/richardsolomou/ras-stack/blob/main/docs/README.md">Docs ↗</a>
          <a href="https://www.npmjs.com/package/ras-stack">npm ↗</a>
          <a href="https://github.com/richardsolomou/ras-stack">GitHub ↗</a>
        </nav>
      </header>

      <main id="top">
        <section className="summary">
          <h1>TypeScript application infrastructure.</h1>
          <div>
            <p className="lead">ras-stack provides shared mechanics that repeat across projects.</p>
            <p>
              It integrates TanStack Start, Better Auth, Drizzle, Centrifugo, PostHog, GitHub Actions, and production runtime tooling. Each
              surface is optional and keeps the underlying API accessible.
            </p>
          </div>
        </section>

        <section>
          <h2>What it provides</h2>
          <div className="rows">
            {surfaces.map(([name, description]) => (
              <div key={name}>
                <strong>{name}</strong>
                <p>{description}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2>The boundary</h2>
          <div className="boundary">
            <div>
              <strong>ras-stack centralizes</strong>
              <p>Security defaults, origin checks, connection lifecycle, migrations, health and shutdown, previews, and releases.</p>
            </div>
            <div>
              <strong>The application owns</strong>
              <p>Routes, schemas, authorization, UI, email templates, storage rules, payloads, and deployment topology.</p>
            </div>
          </div>
        </section>

        <section>
          <h2>Start</h2>
          <div className="commands">
            <div>
              <strong>Apply your selections</strong>
              <code>
                <span aria-hidden="true">$</span> pnpm dlx ras-stack@next sync
              </code>
              <p>Create ras.config.ts with the integrations and tools you want, then sync. Use the next tag during the v5 prerelease.</p>
            </div>
          </div>
          <p className="source-link">
            <a href="https://github.com/richardsolomou/ras-stack/blob/main/docs/managed-installation.md">Read the installation guide ↗</a>
          </p>
        </section>
      </main>

      <footer>
        <span>TanStack · Better Auth · Drizzle · Centrifugo · PostHog</span>
        <span>MIT</span>
      </footer>
    </div>
  )
}
