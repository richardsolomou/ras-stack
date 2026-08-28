import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import styles from '../styles.css?url'

const title = 'ras-stack — Composable TypeScript infrastructure'
const description = 'Strong defaults for auth, data, realtime, observability, and delivery without hiding the libraries underneath.'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title },
      { name: 'description', content: description },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
    ],
    links: [{ rel: 'stylesheet', href: styles }],
  }),
  component: Root,
})

function Root() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
