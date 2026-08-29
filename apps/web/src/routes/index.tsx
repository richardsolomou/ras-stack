import { createFileRoute } from '@tanstack/react-router'

const surfaces = [
  ['TypeScript modules', 'Auth, databases, realtime, email, uploads, PostHog, and TanStack helpers.'],
  ['CLI', 'Create applications, run local realtime, sync production assets, and check repository policy.'],
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
              <strong>New application</strong>
              <code>
                <span aria-hidden="true">$</span> pnpm create ras-app my-app
              </code>
              <p>Generate the tested production reference as ordinary application code.</p>
            </div>
            <div>
              <strong>Existing application</strong>
              <code>
                <span aria-hidden="true">$</span> pnpm add ras-stack
              </code>
              <p>Add only the narrow entrypoints that fit the application.</p>
            </div>
          </div>
          <p className="source-link">
            <a href="https://github.com/richardsolomou/ras-stack/tree/main/examples/full-stack">View the full-stack example ↗</a>
          </p>
        </section>
      </main>

      <footer>
        <span>TanStack · Better Auth · Drizzle · Centrifugo · PostHog</span>
        <span>AGPL-3.0</span>
      </footer>
    </div>
  )
}
