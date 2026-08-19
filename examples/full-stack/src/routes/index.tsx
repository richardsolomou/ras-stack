import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useAuthAction } from 'ras-stack/auth/react'
import { useState } from 'react'
import { authClient } from '../client/auth'
import { snapshotQuery } from '../client/queries'
import { queryErrorMessage } from '../client/queryClient'
import { useRealtime } from '../client/useRealtime'
import { addMessage } from '../server/fns'

export const Route = createFileRoute('/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(snapshotQuery()),
  component: Home,
})

function Home() {
  const { data } = useSuspenseQuery(snapshotQuery())
  const queryClient = useQueryClient()
  useRealtime(Boolean(data.user) && data.realtimeEnabled)
  return (
    <main>
      <h1>ras-stack full-stack example</h1>
      <p className="status">Better Auth, Drizzle migrations, durable uploads, transactional realtime, SMTP, and production lifecycle</p>
      {data.user ? (
        <Messages
          name={data.user.name}
          signOut={async () => {
            await authClient.signOut()
            await queryClient.invalidateQueries()
          }}
        />
      ) : (
        <Authentication emailConfigured={data.emailConfigured} />
      )}
      <MessageList />
    </main>
  )
}

function Authentication({ emailConfigured }: { emailConfigured: boolean }) {
  const [mode, setMode] = useState<'sign-up' | 'sign-in'>('sign-up')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [notice, setNotice] = useState('')
  const queryClient = useQueryClient()
  const action = useAuthAction()
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault()
        setNotice('')
        const result = await action.run(async () => {
          const response =
            mode === 'sign-up'
              ? await authClient.signUp.email({ name, email, password })
              : await authClient.signIn.email({ email, password })
          return response.error ? { error: { message: response.error.message } } : { data: response.data }
        })
        if (!result.error) {
          if (mode === 'sign-up' && emailConfigured) setNotice('Check your email to verify your account.')
          await queryClient.invalidateQueries()
        }
      }}
    >
      <h2>{mode === 'sign-up' ? 'Create account' : 'Sign in'}</h2>
      {mode === 'sign-up' && (
        <label>
          Name
          <input aria-label="Name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} />
        </label>
      )}
      <label>
        Email
        <input aria-label="Email" autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
      </label>
      <label>
        Password
        <input
          aria-label="Password"
          autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <button disabled={action.busy}>{mode === 'sign-up' ? 'Create account' : 'Sign in'}</button>
      <button type="button" onClick={() => setMode(mode === 'sign-up' ? 'sign-in' : 'sign-up')}>
        {mode === 'sign-up' ? 'Use an existing account' : 'Create a new account'}
      </button>
      {emailConfigured && (
        <button
          type="button"
          onClick={async () => {
            await authClient.requestPasswordReset({ email, redirectTo: '/' })
            setNotice('If that account exists, a reset link has been sent.')
          }}
        >
          Reset password
        </button>
      )}
      {notice && <p className="status">{notice}</p>}
      {action.error && <p className="error">{action.error}</p>}
    </form>
  )
}

function Messages({ name, signOut }: { name: string; signOut: () => Promise<void> }) {
  const [body, setBody] = useState('')
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: () => addMessage({ data: { body } }),
    onSuccess: async () => {
      setBody('')
      await queryClient.invalidateQueries({ queryKey: snapshotQuery().queryKey })
    },
  })
  return (
    <section>
      <h2>Hello, {name}</h2>
      <button onClick={() => void signOut()}>Sign out</button>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          mutation.mutate()
        }}
      >
        <label>
          Message
          <input aria-label="Message" value={body} onChange={(event) => setBody(event.target.value)} />
        </label>
        <button disabled={mutation.isPending}>Add message</button>
        {mutation.error && <p className="error">{queryErrorMessage(mutation.error)}</p>}
      </form>
      <Upload />
    </section>
  )
}

function Upload() {
  const [status, setStatus] = useState('No upload yet.')
  return (
    <label>
      Upload a text file
      <input
        aria-label="Upload"
        type="file"
        accept="text/plain"
        onChange={async (event) => {
          const file = event.target.files?.[0]
          if (!file) return
          const { uploadWithTus } = await import('ras-stack/uploads')
          const result = await uploadWithTus(
            { endpoint: '/api/uploads', file, metadata: { filename: file.name, filetype: file.type } },
            false,
          )
          setStatus(`Uploaded to ${result.uploadUrl}`)
        }}
      />
      <span className="status">{status}</span>
    </label>
  )
}

function MessageList() {
  const { data } = useSuspenseQuery(snapshotQuery())
  return (
    <section>
      <h2>Messages</h2>
      <ul>
        {data.messages.map((message) => (
          <li key={message.id}>
            <strong>{message.author}:</strong> {message.body}
          </li>
        ))}
      </ul>
    </section>
  )
}
