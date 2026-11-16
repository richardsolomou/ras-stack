import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { authClient } from '../client/auth'
import { readViewer } from '../server/functions'

export const Route = createFileRoute('/account')({
  loader: async () => {
    const viewer = await readViewer()
    if (!viewer) throw redirect({ to: '/sign-in', search: { next: '/account' } })
    return viewer
  },
  component: Account,
})

function Account() {
  const viewer = Route.useLoaderData()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <p>
        Signed in as <strong>{viewer.name}</strong> ({viewer.email}).
      </p>
      <button
        type="button"
        className="mt-4 underline"
        onClick={async () => {
          await authClient.signOut()
          await queryClient.invalidateQueries()
          await navigate({ to: '/sign-in' })
        }}
      >
        Sign out
      </button>
    </main>
  )
}
