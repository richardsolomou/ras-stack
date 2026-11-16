import { useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { authClient } from '../client/auth'
import { classifyAuthCallbackFailure, classifySignInFailure } from '../client/authFailures'
import { localRedirectPath } from '../client/localRedirect'
import { useAuthAction } from '../client/useAuthAction'
import { readSignInOptions } from '../server/functions'

const signInMessages = {
  invalid_credentials: 'That email and password do not match.',
  rate_limited: 'Too many attempts. Wait a minute and try again.',
  error: 'Signing in did not work. Try again.',
}

export const Route = createFileRoute('/sign-in')({
  validateSearch: (search: Record<string, unknown>): { next?: string; error?: string } => ({
    next: localRedirectPath(search.next),
    error: typeof search.error === 'string' ? search.error : undefined,
  }),
  loader: () => readSignInOptions(),
  component: SignIn,
})

function SignIn() {
  const { next, error } = Route.useSearch()
  const { providers } = Route.useLoaderData()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const signIn = useAuthAction({ failureMessage: (failure) => signInMessages[classifySignInFailure(failure)] })
  return (
    <main className="mx-auto max-w-sm px-6 py-16">
      <h1 className="text-2xl">Sign in</h1>
      {error && <p className="mt-4 text-red-700">Signing in did not finish ({classifyAuthCallbackFailure(error)}).</p>}
      <form
        className="mt-6 grid gap-3"
        onSubmit={async (event) => {
          event.preventDefault()
          // Read from the form, not from state, so values a password manager filled without input events are sent.
          const form = new FormData(event.currentTarget)
          const result = await signIn.run(() =>
            authClient.signIn.email({ email: formText(form, 'email'), password: formText(form, 'password') }),
          )
          if (result.error) return
          await queryClient.invalidateQueries()
          await navigate({ to: next ?? '/account' })
        }}
      >
        <input className="rounded border px-3 py-2" aria-label="Email" name="email" type="email" autoComplete="email" required />
        <input
          className="rounded border px-3 py-2"
          aria-label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        <button type="submit" className="rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-50" disabled={signIn.busy}>
          Sign in
        </button>
        {signIn.error && <p className="text-red-700">{signIn.error}</p>}
      </form>
      {providers.map((provider) => (
        <button
          key={provider}
          type="button"
          className="mt-3 w-full rounded border px-4 py-2"
          onClick={() => void authClient.signIn.social({ provider, callbackURL: next ?? '/', errorCallbackURL: '/sign-in' })}
        >
          Continue with {provider}
        </button>
      ))}
      <p className="mt-4 text-sm">
        New here?{' '}
        <Link to="/sign-up" className="underline">
          Sign up
        </Link>
      </p>
    </main>
  )
}

function formText(form: FormData, name: string) {
  const value = form.get(name)
  return typeof value === 'string' ? value : ''
}
