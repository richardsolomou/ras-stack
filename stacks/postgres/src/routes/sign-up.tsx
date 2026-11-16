import { useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { authClient } from '../client/auth'
import { useAuthAction } from '../client/useAuthAction'

export const Route = createFileRoute('/sign-up')({ component: SignUp })

function SignUp() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const signUp = useAuthAction()
  return (
    <main className="mx-auto max-w-sm px-6 py-16">
      <h1 className="text-2xl">Sign up</h1>
      <form
        className="mt-6 grid gap-3"
        onSubmit={async (event) => {
          event.preventDefault()
          // Read from the form, not from state, so values a password manager filled without input events are sent.
          const form = new FormData(event.currentTarget)
          const result = await signUp.run(() =>
            authClient.signUp.email({ name: formText(form, 'name'), email: formText(form, 'email'), password: formText(form, 'password') }),
          )
          if (result.error) return
          await queryClient.invalidateQueries()
          await navigate({ to: '/account' })
        }}
      >
        <input className="rounded border px-3 py-2" aria-label="Name" name="name" autoComplete="name" required />
        <input className="rounded border px-3 py-2" aria-label="Email" name="email" type="email" autoComplete="email" required />
        <input
          className="rounded border px-3 py-2"
          aria-label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <button type="submit" className="rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-50" disabled={signUp.busy}>
          Sign up
        </button>
        {signUp.error && <p className="text-red-700">{signUp.error}</p>}
      </form>
      <p className="mt-4 text-sm">
        Have an account?{' '}
        <Link to="/sign-in" className="underline">
          Sign in
        </Link>
      </p>
    </main>
  )
}

function formText(form: FormData, name: string) {
  const value = form.get(name)
  return typeof value === 'string' ? value : ''
}
