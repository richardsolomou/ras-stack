const capabilities = ['Auth', 'Data', 'Realtime', 'Observability', 'Delivery']

export default function Home() {
  return (
    <div className="shell">
      <header>
        <a className="wordmark" href="#top">
          ras-stack
        </a>
        <nav aria-label="Primary navigation">
          <a href="https://www.npmjs.com/package/ras-stack">npm</a>
          <a href="https://github.com/richardsolomou/ras-stack">GitHub</a>
        </nav>
      </header>

      <main id="top">
        <div className="hero-copy">
          <p className="eyebrow">Composable TypeScript infrastructure</p>
          <h1>The parts every app needs. Built once.</h1>
          <p className="intro">
            Strong defaults for auth, data, realtime, observability, and delivery—without hiding the libraries underneath.
          </p>
          <div className="actions">
            <a className="primary-action" href="https://www.npmjs.com/package/ras-stack">
              Get started <span aria-hidden="true">→</span>
            </a>
            <code>
              <span aria-hidden="true">$</span> pnpm add ras-stack
            </code>
          </div>
        </div>

        <aside aria-label="Included primitives">
          {capabilities.map((capability, index) => (
            <p key={capability}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              {capability}
            </p>
          ))}
        </aside>
      </main>

      <footer>
        <p>TanStack · Better Auth · Drizzle · Centrifugo · PostHog</p>
        <p>AGPL-3.0</p>
      </footer>
    </div>
  )
}
