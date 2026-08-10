import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useAuthAction } from 'ras-stack/auth/react'
import { useState } from 'react'
import { snapshotQuery } from '../client/queries'
import { queryErrorMessage } from '../client/queryClient'
import { useRealtime } from '../client/useRealtime'
import { addMessage, signIn } from '../server/fns'

export const Route = createFileRoute('/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(snapshotQuery()),
  component: Home,
})

function Home() {
  const { data } = useSuspenseQuery(snapshotQuery())
  useRealtime(Boolean(data.user))
  return (
    <main>
      <h1>ras-stack full-stack example</h1>
      <p className="status">workspace package, SQLite, RPC, auth, query, uploads, email, and realtime</p>
      {data.user ? <Messages name={data.user.name} /> : <SignIn />}
      {data.emailConfigured && <p>SMTP is configured.</p>}
      <MessageList />
    </main>
  )
}

function SignIn() {
  const [name, setName] = useState('')
  const queryClient = useQueryClient()
  const action = useAuthAction()
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault()
        const result = await action.run(() => signIn({ data: { name } }).then((data) => ({ data })))
        if (!result.error) await queryClient.invalidateQueries()
      }}
    >
      <h2>Sign in</h2>
      <label>
        Name
        <input aria-label="Name" value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <button disabled={action.busy}>Continue</button>
      {action.error && <p className="error">{action.error}</p>}
    </form>
  )
}

function Messages({ name }: { name: string }) {
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
          const result = await uploadWithTus({ endpoint: '/api/uploads', file, metadata: { filename: file.name } }, false)
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
