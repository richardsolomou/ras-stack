import { createFileRoute } from '@tanstack/react-router'

const surfaces = [
  ['Recipes', 'Auth, databases, realtime, email, uploads, PostHog, and deployment as code each application copies and owns.'],
  ['Stacks', 'Complete applications assembled from recipes and checked in CI, to read when wiring is unclear.'],
  ['Agent skill', 'Adds recipes to an application, merges later recipe changes into its copy, and reports drift.'],
  ['Presets', 'TypeScript and Oxlint configuration every application extends.'],
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
            <p className="lead">ras-stack is working code an application copies once and then owns.</p>
            <p>
              Each recipe covers one job across TanStack Start, Better Auth, Drizzle, Centrifugo, PostHog, and deployment, with the
              decisions behind it written down. Applications read and change the code in place instead of depending on a library.
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
              <strong>Recipes decide</strong>
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
              <strong>Choose recipes</strong>
              <p>Pick the recipes the application needs, then ask an agent with the ras-recipes skill to add them.</p>
            </div>
          </div>
          <p className="source-link">
            <a href="https://github.com/richardsolomou/ras-stack/blob/main/recipes/README.md">Read the recipe guide ↗</a>
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
